const state = {
  data: null,
  tree: null,
  searchTerm: "",
  activeTag: "全部",
  selectedPath: [],
  colors: null,
};

const SITE_TITLE = "猫冬吧";
const STORAGE_KEY = "nav_site_data";
const COLOR_KEY = "nav_site_colors";

const elements = {
  title: document.getElementById("site-title"),
  description: document.getElementById("site-description"),
  stats: document.getElementById("stats"),
  tagFilters: document.getElementById("tag-filters"),
  groups: document.getElementById("groups"),
  searchInput: document.getElementById("search-input"),
  clearSearch: document.getElementById("clear-search"),
  toggleAll: document.getElementById("toggle-all"),
  openAdmin: document.getElementById("open-admin"),
  closeAdmin: document.getElementById("close-admin"),
  adminPanel: document.getElementById("admin-panel"),
  uploadButton: document.getElementById("upload-bookmarks"),
  bookmarkFile: document.getElementById("bookmark-file"),
  cardTemplate: document.getElementById("link-card-template"),
  newFolderName: document.getElementById("new-folder-name"),
  renameFolderName: document.getElementById("rename-folder-name"),
  addFolder: document.getElementById("add-folder"),
  renameFolder: document.getElementById("rename-folder"),
  deleteFolder: document.getElementById("delete-folder"),
  moveFolderTarget: document.getElementById("move-folder-target"),
  moveFolder: document.getElementById("move-folder"),
  folderOrder: document.getElementById("folder-order"),
  newLinkTitle: document.getElementById("new-link-title"),
  newLinkUrl: document.getElementById("new-link-url"),
  addLink: document.getElementById("add-link"),
  moveLinkItem: document.getElementById("move-link-item"),
  moveLinkTarget: document.getElementById("move-link-target"),
  moveLink: document.getElementById("move-link"),
  linkList: document.getElementById("link-list"),
  colorPage: document.getElementById("color-page"),
  colorColumn: document.getElementById("color-column"),
  colorFolder: document.getElementById("color-folder"),
  colorLink: document.getElementById("color-link"),
  exportBookmarks: document.getElementById("export-bookmarks"),
};

const normalize = (value) => (value || "").toLowerCase().trim();

const truncateText = (value, limit) => {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
};

const DEFAULT_COLORS = {
  page: "#f6f3ee",
  column: "#ffffff",
  folder: "#f6f3ef",
  link: "#f1f3f6",
};

const applyColors = (colors) => {
  const root = document.documentElement.style;
  root.setProperty("--page-bg", colors.page);
  root.setProperty("--column-bg", colors.column);
  root.setProperty("--folder-bg", colors.folder);
  root.setProperty("--link-bg", colors.link);
};

const loadColors = () => {
  const stored = localStorage.getItem(COLOR_KEY);
  if (stored) {
    try {
      return { ...DEFAULT_COLORS, ...JSON.parse(stored) };
    } catch (error) {
      localStorage.removeItem(COLOR_KEY);
    }
  }
  return { ...DEFAULT_COLORS };
};

const saveColors = (colors) => {
  localStorage.setItem(COLOR_KEY, JSON.stringify(colors));
  applyColors(colors);
};

const parseBookmarksHtml = (htmlText) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");
  const root = doc.querySelector("dl");
  const entries = [];

  const walkDl = (dlNode, path) => {
    if (!dlNode) return;
    const children = Array.from(dlNode.children);
    for (let i = 0; i < children.length; i += 1) {
      const node = children[i];
      if (node.tagName === "DT") {
        const folderNode = node.querySelector(":scope > h3");
        const linkNode = node.querySelector(":scope > a");

        if (folderNode) {
          const folderName = folderNode.textContent.trim() || "未命名文件夹";
          const nestedDl =
            node.querySelector(":scope > dl") ||
            (node.nextElementSibling && node.nextElementSibling.tagName === "DL"
              ? node.nextElementSibling
              : null);
          walkDl(nestedDl, [...path, folderName]);
        } else if (linkNode) {
          const url = linkNode.getAttribute("href") || linkNode.href || "";
          const title = linkNode.textContent.trim() || url;
          entries.push({
            path: [...path],
            link: {
              title,
              url,
              desc: "",
              tags: [],
            },
          });
        }
      } else if (node.tagName === "DL") {
        walkDl(node, path);
      }
    }
  };

  walkDl(root, []);

  const rootCandidates = new Set();
  entries.forEach((entry) => {
    if (entry.path.length > 0) {
      rootCandidates.add(entry.path[0]);
    }
  });

  const rootName = rootCandidates.size === 1 ? Array.from(rootCandidates)[0] : null;
  const isWrapperRoot =
    rootName &&
    /(书签|Bookmarks|Bookmarks bar|Other bookmarks|其他书签|移动设备书签|Mobile bookmarks)/i.test(
      rootName
    );

  const normalizedEntries = entries.map((entry) => {
    if (isWrapperRoot && entry.path[0] === rootName) {
      return { ...entry, path: entry.path.slice(1) };
    }
    return entry;
  });

  const groupsMap = new Map();
  const ensureGroup = (path) => {
    const groupName = (path.length ? path : ["未分类"]).join(" / ");
    if (!groupsMap.has(groupName)) {
      groupsMap.set(groupName, []);
    }
    return groupName;
  };

  normalizedEntries.forEach((entry) => {
    const groupName = ensureGroup(entry.path);
    groupsMap.get(groupName).push(entry.link);
  });

  const groups = Array.from(groupsMap.entries()).map(([name, links]) => ({
    name,
    links,
  }));

  return {
    title: SITE_TITLE,
    description: "由浏览器书签导入生成",
    groups,
  };
};

const buildTagIndex = (groups) => {
  const tags = new Set();
  groups.forEach((group) => {
    group.links.forEach((link) => {
      (link.tags || []).forEach((tag) => tags.add(tag));
    });
  });
  return ["全部", ...Array.from(tags).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))];
};

const ensureChild = (node, name) => {
  let child = node.children.find((item) => item.name === name);
  if (!child) {
    child = { name, children: [], links: [] };
    node.children.push(child);
  }
  return child;
};

const buildTree = (groups) => {
  const root = { name: "root", children: [], links: [] };

  groups.forEach((group) => {
    if (group.name === "未分类") {
      root.links.push(...group.links);
      return;
    }
    const parts = group.name.split(" / ").map((part) => part.trim()).filter(Boolean);
    let node = root;
    parts.forEach((part) => {
      node = ensureChild(node, part);
    });
    node.links.push(...group.links);
  });

  return root;
};

const treeToGroups = (node, path = []) => {
  const groups = [];
  if (node.links.length) {
    const name = path.length ? path.join(" / ") : "未分类";
    groups.push({ name, links: node.links });
  }
  node.children.forEach((child) => {
    groups.push(...treeToGroups(child, [...path, child.name]));
  });
  return groups;
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const buildBookmarksHtml = (root) => {
  const renderLinks = (links) =>
    links
      .map(
        (link) =>
          `<DT><A HREF="${escapeHtml(link.url)}">${escapeHtml(link.title || link.url)}</A>`
      )
      .join("\n");

  const renderFolder = (node) => {
    const childrenHtml = node.children.map(renderFolder).join("\n");
    const linksHtml = renderLinks(node.links);
    const content = [childrenHtml, linksHtml].filter(Boolean).join("\n");
    return `
<DT><H3>${escapeHtml(node.name)}</H3>
<DL><p>
${content}
</DL><p>`;
  };

  const topFolders = root.children.map(renderFolder).join("\n");
  const topLinks = renderLinks(root.links);
  const bodyContent = [topFolders, topLinks].filter(Boolean).join("\n");

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${bodyContent}
</DL><p>`;
};

const getNodeByPath = (root, path) => {
  let node = root;
  for (let i = 0; i < path.length; i += 1) {
    node = node.children.find((child) => child.name === path[i]);
    if (!node) return null;
  }
  return node;
};

const getParentNode = (root, path) => {
  if (path.length === 0) return null;
  const parentPath = path.slice(0, -1);
  return getNodeByPath(root, parentPath);
};

const getAllFolderPaths = (node, path = []) => {
  const paths = [];
  node.children.forEach((child) => {
    const next = [...path, child.name];
    paths.push(next);
    paths.push(...getAllFolderPaths(child, next));
  });
  return paths;
};

const isDescendant = (node, targetName, path = []) => {
  if (node.name === targetName && path.length) return true;
  return node.children.some((child) => isDescendant(child, targetName, [...path, child.name]));
};

const countLinks = (node) => {
  let total = node.links.length;
  node.children.forEach((child) => {
    total += countLinks(child);
  });
  return total;
};

const syncDataFromTree = () => {
  if (!state.tree) return;
  state.data = {
    title: SITE_TITLE,
    description: state.data?.description || "由浏览器书签导入生成",
    groups: treeToGroups(state.tree),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
};

const pathToLabel = (path) => (path.length ? path.join(" / ") : "根目录");
const isPathPrefix = (prefix, path) =>
  prefix.length <= path.length && prefix.every((part, index) => part === path[index]);

const renderAdminPanel = () => {
  if (elements.adminPanel.classList.contains("hidden")) return;
  const currentNode = getNodeByPath(state.tree, state.selectedPath) || state.tree;
  elements.renameFolderName.value = "";
  elements.newFolderName.value = "";
  elements.newLinkTitle.value = "";
  elements.newLinkUrl.value = "";

  elements.renameFolder.disabled = state.selectedPath.length === 0;
  elements.deleteFolder.disabled = state.selectedPath.length === 0;
  elements.moveFolder.disabled = state.selectedPath.length === 0;

  const allPaths = getAllFolderPaths(state.tree);
  const availableTargets = allPaths.filter((path) => {
    if (state.selectedPath.length === 0) return false;
    if (isPathPrefix(state.selectedPath, path)) return false;
    return true;
  });

  elements.moveFolderTarget.innerHTML = "";
  const rootOption = document.createElement("option");
  rootOption.value = "";
  rootOption.textContent = "根目录";
  elements.moveFolderTarget.appendChild(rootOption);
  availableTargets.forEach((path) => {
    const option = document.createElement("option");
    option.value = path.join(" / ");
    option.textContent = pathToLabel(path);
    elements.moveFolderTarget.appendChild(option);
  });

  elements.folderOrder.innerHTML = "";
  currentNode.children.forEach((child, index) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    const title = document.createElement("span");
    title.className = "admin-item-title";
    title.textContent = child.name;
    const actions = document.createElement("div");
    actions.className = "admin-item-actions";

    const enterBtn = document.createElement("button");
    enterBtn.className = "ghost-button";
    enterBtn.type = "button";
    enterBtn.textContent = "进入";
    enterBtn.addEventListener("click", () => {
      state.selectedPath = [...state.selectedPath, child.name];
      render();
      renderAdminPanel();
    });

    const upBtn = document.createElement("button");
    upBtn.className = "ghost-button";
    upBtn.type = "button";
    upBtn.textContent = "上移";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", () => {
      currentNode.children.splice(index, 1);
      currentNode.children.splice(index - 1, 0, child);
      syncDataFromTree();
      render();
      renderAdminPanel();
    });

    const downBtn = document.createElement("button");
    downBtn.className = "ghost-button";
    downBtn.type = "button";
    downBtn.textContent = "下移";
    downBtn.disabled = index === currentNode.children.length - 1;
    downBtn.addEventListener("click", () => {
      currentNode.children.splice(index, 1);
      currentNode.children.splice(index + 1, 0, child);
      syncDataFromTree();
      render();
      renderAdminPanel();
    });

    actions.appendChild(enterBtn);
    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    item.appendChild(title);
    item.appendChild(actions);
    elements.folderOrder.appendChild(item);
  });

  elements.linkList.innerHTML = "";
  elements.moveLinkItem.innerHTML = "";
  elements.moveLinkTarget.innerHTML = "";
  const linkTargetRoot = document.createElement("option");
  linkTargetRoot.value = "";
  linkTargetRoot.textContent = "根目录";
  elements.moveLinkTarget.appendChild(linkTargetRoot);
  allPaths.forEach((path) => {
    const option = document.createElement("option");
    option.value = path.join(" / ");
    option.textContent = pathToLabel(path);
    elements.moveLinkTarget.appendChild(option);
  });

  currentNode.links.forEach((link, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = link.title || link.url;
    elements.moveLinkItem.appendChild(option);
  });
  currentNode.links.forEach((link, index) => {
    const item = document.createElement("div");
    item.className = "admin-item";
    const title = document.createElement("span");
    title.className = "admin-item-title";
    title.textContent = link.title || link.url;
    const actions = document.createElement("div");
    actions.className = "admin-item-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "ghost-button";
    editBtn.type = "button";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => {
      const nextTitle = prompt("修改标题", link.title || "");
      if (nextTitle === null) return;
      const nextUrl = prompt("修改网址", link.url || "");
      if (nextUrl === null) return;
      link.title = nextTitle.trim() || link.url;
      link.url = nextUrl.trim() || link.url;
      syncDataFromTree();
      render();
      renderAdminPanel();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost-button danger";
    deleteBtn.type = "button";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", () => {
      currentNode.links.splice(index, 1);
      syncDataFromTree();
      render();
      renderAdminPanel();
    });

    const upBtn = document.createElement("button");
    upBtn.className = "ghost-button";
    upBtn.type = "button";
    upBtn.textContent = "上移";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", () => {
      currentNode.links.splice(index, 1);
      currentNode.links.splice(index - 1, 0, link);
      syncDataFromTree();
      render();
      renderAdminPanel();
    });

    const downBtn = document.createElement("button");
    downBtn.className = "ghost-button";
    downBtn.type = "button";
    downBtn.textContent = "下移";
    downBtn.disabled = index === currentNode.links.length - 1;
    downBtn.addEventListener("click", () => {
      currentNode.links.splice(index, 1);
      currentNode.links.splice(index + 1, 0, link);
      syncDataFromTree();
      render();
      renderAdminPanel();
    });

    actions.appendChild(editBtn);
    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(title);
    item.appendChild(actions);
    elements.linkList.appendChild(item);
  });

  elements.colorPage.value = state.colors.page;
  elements.colorColumn.value = state.colors.column;
  elements.colorFolder.value = state.colors.folder;
  elements.colorLink.value = state.colors.link;
};

const filterLinks = (groups, searchTerm, activeTag) => {
  const term = normalize(searchTerm);
  return groups
    .map((group) => ({
      ...group,
      links: group.links.filter((link) => {
        const haystack = [
          link.title,
          link.url,
          link.desc,
          ...(link.tags || []),
          group.name,
        ]
          .map(normalize)
          .join(" ");
        const matchesTerm = !term || haystack.includes(term);
        const matchesTag = activeTag === "全部" || (link.tags || []).includes(activeTag);
        return matchesTerm && matchesTag;
      }),
    }))
    .filter((group) => group.links.length > 0);
};

const renderStats = (groups) => {
  const totalLinks = groups.reduce((sum, group) => sum + group.links.length, 0);
  elements.stats.textContent = `共 ${groups.length} 个分组，${totalLinks} 条链接`;
};

const renderTags = (tags) => {
  elements.tagFilters.innerHTML = "";
  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tag-filter${tag === state.activeTag ? " active" : ""}`;
    button.textContent = tag;
    button.addEventListener("click", () => {
      state.activeTag = tag;
      render();
    });
    elements.tagFilters.appendChild(button);
  });
};

const renderGroups = (groups) => {
  elements.groups.innerHTML = "";
  const tree = buildTree(groups);
  const columns = document.createElement("div");
  columns.className = "columns";

  const renderLinks = (links, container) => {
    if (!links.length) return;
    const list = document.createElement("div");
    list.className = "column-links";
    links.forEach((link) => {
      const card = elements.cardTemplate.content.cloneNode(true);
      const titleNode = card.querySelector(".link-title");
      titleNode.textContent = link.title || link.url;
      const urlNode = card.querySelector(".link-url");
      urlNode.textContent = truncateText(link.url, 60);
      urlNode.title = link.url || "";

      const anchor = card.querySelector(".link-card");
      anchor.href = link.url;
      list.appendChild(card);
    });
    container.appendChild(list);
  };

  const renderColumn = (node, depth) => {
    const column = document.createElement("div");
    column.className = "column";

    const folderList = document.createElement("div");
    folderList.className = "column-folders";

    node.children.forEach((child) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "folder-item";
      const isActive = state.selectedPath[depth] === child.name;
      if (isActive) item.classList.add("active");

      const left = document.createElement("span");
      left.className = "folder-name";
      left.textContent = child.name;

      const right = document.createElement("span");
      right.className = "folder-count";
      right.textContent = `${countLinks(child)} 条`;

      item.appendChild(left);
      item.appendChild(right);
      item.addEventListener("click", () => {
        state.selectedPath = [...state.selectedPath.slice(0, depth), child.name];
        render();
      });
      folderList.appendChild(item);
    });

    if (folderList.children.length) {
      column.appendChild(folderList);
    }

    renderLinks(node.links, column);
    columns.appendChild(column);
  };

  let current = tree;
  let depth = 0;
  const maxDepth = 4;
  renderColumn(current, depth);
  while (state.selectedPath[depth] && depth + 1 < maxDepth) {
    const next = current.children.find((child) => child.name === state.selectedPath[depth]);
    if (!next) break;
    current = next;
    depth += 1;
    renderColumn(current, depth);
  }

  for (let i = depth + 1; i < maxDepth; i += 1) {
    const column = document.createElement("div");
    column.className = "column column-empty";
    columns.appendChild(column);
  }

  elements.groups.appendChild(columns);
};

const updateToggleButton = () => {
  elements.toggleAll.textContent = state.selectedPath.length ? "回到顶层" : "顶层";
};

const render = () => {
  if (!state.data) return;
  const filteredGroups = filterLinks(state.data.groups, state.searchTerm, state.activeTag);
  renderStats(filteredGroups);
  renderGroups(filteredGroups);
  renderTags(buildTagIndex(state.data.groups));
  updateToggleButton();
  renderAdminPanel();
};

const setupEvents = () => {
  elements.searchInput.addEventListener("input", (event) => {
    state.searchTerm = event.target.value;
    render();
  });

  elements.clearSearch.addEventListener("click", () => {
    state.searchTerm = "";
    elements.searchInput.value = "";
    render();
  });

  elements.toggleAll.addEventListener("click", () => {
    state.selectedPath = [];
    render();
  });

  elements.openAdmin.addEventListener("click", () => {
    elements.adminPanel.classList.remove("hidden");
    renderAdminPanel();
  });

  elements.closeAdmin.addEventListener("click", () => {
    elements.adminPanel.classList.add("hidden");
  });

  elements.uploadButton.addEventListener("click", () => {
    elements.bookmarkFile.click();
  });

  elements.bookmarkFile.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = parseBookmarksHtml(text);
      state.data = data;
      state.tree = buildTree(data.groups);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      state.searchTerm = "";
      state.activeTag = "全部";
      elements.searchInput.value = "";
      elements.title.textContent = SITE_TITLE;
      elements.description.textContent = data.description;
      render();
      updateToggleButton();
      renderAdminPanel();
    } catch (error) {
      elements.stats.textContent = "书签文件解析失败，请确认是 HTML 格式。";
    } finally {
      event.target.value = "";
    }
  });

  elements.addFolder.addEventListener("click", () => {
    const name = elements.newFolderName.value.trim();
    if (!name) return;
    const currentNode = getNodeByPath(state.tree, state.selectedPath) || state.tree;
    if (currentNode.children.find((child) => child.name === name)) return;
    currentNode.children.push({ name, children: [], links: [] });
    elements.newFolderName.value = "";
    syncDataFromTree();
    render();
    renderAdminPanel();
  });

  elements.renameFolder.addEventListener("click", () => {
    const name = elements.renameFolderName.value.trim();
    if (!name || state.selectedPath.length === 0) return;
    const currentNode = getNodeByPath(state.tree, state.selectedPath);
    if (!currentNode) return;
    const parent = getParentNode(state.tree, state.selectedPath);
    if (parent && parent.children.some((child) => child.name === name)) return;
    currentNode.name = name;
    state.selectedPath[state.selectedPath.length - 1] = name;
    syncDataFromTree();
    render();
    renderAdminPanel();
  });

  elements.deleteFolder.addEventListener("click", () => {
    if (state.selectedPath.length === 0) return;
    const parent = getParentNode(state.tree, state.selectedPath);
    if (!parent) return;
    const targetName = state.selectedPath[state.selectedPath.length - 1];
    parent.children = parent.children.filter((child) => child.name !== targetName);
    state.selectedPath = state.selectedPath.slice(0, -1);
    syncDataFromTree();
    render();
    renderAdminPanel();
  });

  elements.moveFolder.addEventListener("click", () => {
    if (state.selectedPath.length === 0) return;
    const parent = getParentNode(state.tree, state.selectedPath);
    if (!parent) return;
    const targetName = state.selectedPath[state.selectedPath.length - 1];
    const nodeIndex = parent.children.findIndex((child) => child.name === targetName);
    if (nodeIndex < 0) return;
    const [node] = parent.children.splice(nodeIndex, 1);

    const targetPath = elements.moveFolderTarget.value
      ? elements.moveFolderTarget.value.split(" / ")
      : [];
    const targetNode = getNodeByPath(state.tree, targetPath) || state.tree;
    if (targetNode.children.some((child) => child.name === node.name)) {
      parent.children.splice(nodeIndex, 0, node);
      return;
    }
    targetNode.children.push(node);
    state.selectedPath = targetPath.concat(node.name);
    syncDataFromTree();
    render();
    renderAdminPanel();
  });

  elements.addLink.addEventListener("click", () => {
    const title = elements.newLinkTitle.value.trim();
    const url = elements.newLinkUrl.value.trim();
    if (!url) return;
    const currentNode = getNodeByPath(state.tree, state.selectedPath) || state.tree;
    currentNode.links.push({ title: title || url, url, desc: "", tags: [] });
    elements.newLinkTitle.value = "";
    elements.newLinkUrl.value = "";
    syncDataFromTree();
    render();
    renderAdminPanel();
  });

  elements.moveLink.addEventListener("click", () => {
    const index = Number(elements.moveLinkItem.value);
    if (Number.isNaN(index)) return;
    const currentNode = getNodeByPath(state.tree, state.selectedPath) || state.tree;
    const link = currentNode.links[index];
    if (!link) return;
    currentNode.links.splice(index, 1);
    const targetPath = elements.moveLinkTarget.value
      ? elements.moveLinkTarget.value.split(" / ")
      : [];
    const targetNode = getNodeByPath(state.tree, targetPath) || state.tree;
    targetNode.links.push(link);
    syncDataFromTree();
    render();
    renderAdminPanel();
  });

  const onColorChange = () => {
    state.colors = {
      page: elements.colorPage.value,
      column: elements.colorColumn.value,
      folder: elements.colorFolder.value,
      link: elements.colorLink.value,
    };
    saveColors(state.colors);
  };

  elements.colorPage.addEventListener("input", onColorChange);
  elements.colorColumn.addEventListener("input", onColorChange);
  elements.colorFolder.addEventListener("input", onColorChange);
  elements.colorLink.addEventListener("input", onColorChange);
  elements.exportBookmarks.addEventListener("click", () => {
    if (!state.tree) return;
    const html = buildBookmarksHtml(state.tree);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bookmarks.html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
};

const init = async () => {
  let data = null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      data = JSON.parse(stored);
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  if (!data) {
    data = window.NAV_DATA || null;
  }

  if (!data) {
    try {
      const response = await fetch("data.json");
      data = await response.json();
    } catch (error) {
      elements.stats.textContent = "无法读取数据，请重新导入书签。";
      return;
    }
  }

  state.data = data;
  state.tree = buildTree(data.groups || []);
  state.colors = loadColors();
  applyColors(state.colors);
  elements.title.textContent = SITE_TITLE;
  document.title = SITE_TITLE;
  elements.description.textContent = data.description || "把你的收藏夹整理成清爽的导航页";
  setupEvents();
  render();
  updateToggleButton();
  renderAdminPanel();
};

init();
