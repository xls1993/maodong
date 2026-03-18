const state = {
  data: null,
  tree: null,
  searchTerm: "",
  activeTag: "全部",
  selectedPath: [],
  colors: null,
  siteTitle: "",
  siteSlogan: "",
};

const DEFAULT_TITLE = "猫冬吧";
const DEFAULT_SLOGAN = "定制你自己的导航";
const STORAGE_KEY = "nav_site_data";
const COLOR_KEY = "nav_site_colors";
const TITLE_KEY = "nav_site_title";
const SLOGAN_KEY = "nav_site_slogan";

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
  tooltip: document.getElementById("link-tooltip"),
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
  exportJson: document.getElementById("export-json"),
  importJson: document.getElementById("import-json"),
  importJsonFile: document.getElementById("import-json-file"),
  customTitle: document.getElementById("custom-title"),
  customSlogan: document.getElementById("custom-slogan"),
  saveTitle: document.getElementById("save-title"),
  ctxMenu: document.getElementById("ctx-menu"),
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
    title: state.siteTitle || DEFAULT_TITLE,
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
    title: state.siteTitle || DEFAULT_TITLE,
    description: state.siteSlogan || DEFAULT_SLOGAN,
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

  elements.customTitle.value = state.siteTitle;
  elements.customSlogan.value = state.siteSlogan;
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

const isMobile = () => window.innerWidth <= 640;

const renderLinks = (links, container) => {
  if (!links.length) return;
  const list = document.createElement("div");
  list.className = "column-links";
  links.forEach((link) => {
    const card = elements.cardTemplate.content.cloneNode(true);
    const titleNode = card.querySelector(".link-title");
    titleNode.textContent = link.title || link.url;
    const urlNode = card.querySelector(".link-url");
    urlNode.textContent = "";
    urlNode.title = "";

    const anchor = card.querySelector(".link-card");
    anchor.href = link.url;
    anchor.dataset.url = link.url;
    list.appendChild(card);
  });
  container.appendChild(list);
};

const renderGroupsDesktop = (tree) => {
  const columns = document.createElement("div");
  columns.className = "columns";

  const renderColumn = (node, depth) => {
    const column = document.createElement("div");
    column.className = "column";

    const folderList = document.createElement("div");
    folderList.className = "column-folders";

    node.children.forEach((child) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "folder-item";
      item.dataset.depth = depth;
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
  const maxDepth = Math.max(4, state.selectedPath.length + 1);
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

  if (maxDepth > 4) {
    columns.classList.add("columns-scroll");
  }

  return columns;
};

const renderGroupsMobile = (tree) => {
  const wrapper = document.createElement("div");
  wrapper.className = "mobile-view";

  let current = tree;
  for (let i = 0; i < state.selectedPath.length; i += 1) {
    const next = current.children.find((child) => child.name === state.selectedPath[i]);
    if (!next) break;
    current = next;
  }

  if (state.selectedPath.length > 0) {
    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "mobile-back";
    backBtn.textContent = "← 返回上一级";
    backBtn.addEventListener("click", () => {
      state.selectedPath = state.selectedPath.slice(0, -1);
      render();
    });
    wrapper.appendChild(backBtn);

    const currentTitle = document.createElement("div");
    currentTitle.className = "mobile-current-title";
    currentTitle.textContent = state.selectedPath[state.selectedPath.length - 1];
    wrapper.appendChild(currentTitle);
  }

  const column = document.createElement("div");
  column.className = "column";

  const folderList = document.createElement("div");
  folderList.className = "column-folders";

  current.children.forEach((child) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "folder-item";

    const left = document.createElement("span");
    left.className = "folder-name";
    left.textContent = child.name;

    const right = document.createElement("span");
    right.className = "folder-count";
    right.textContent = `${countLinks(child)} 条`;

    item.appendChild(left);
    item.appendChild(right);
    item.addEventListener("click", () => {
      state.selectedPath = [...state.selectedPath, child.name];
      render();
    });
    folderList.appendChild(item);
  });

  if (folderList.children.length) {
    column.appendChild(folderList);
  }

  renderLinks(current.links, column);
  wrapper.appendChild(column);

  return wrapper;
};

const renderSearchResults = (groups) => {
  const wrapper = document.createElement("div");
  wrapper.className = "search-results";

  groups.forEach((group) => {
    if (!group.links.length) return;
    const section = document.createElement("div");
    section.className = "search-group";

    const header = document.createElement("div");
    header.className = "search-group-header";
    header.textContent = group.name;
    section.appendChild(header);

    const list = document.createElement("div");
    list.className = "column-links";
    group.links.forEach((link) => {
      const card = elements.cardTemplate.content.cloneNode(true);
      card.querySelector(".link-title").textContent = link.title || link.url;
      const urlNode = card.querySelector(".link-url");
      urlNode.textContent = "";
      urlNode.title = "";
      const anchor = card.querySelector(".link-card");
      anchor.href = link.url;
      anchor.dataset.url = link.url;
      list.appendChild(card);
    });
    section.appendChild(list);
    wrapper.appendChild(section);
  });

  if (!wrapper.children.length) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = "没有找到匹配的书签";
    wrapper.appendChild(empty);
  }

  return wrapper;
};

const renderGroups = (groups) => {
  elements.groups.innerHTML = "";

  if (state.searchTerm) {
    elements.groups.appendChild(renderSearchResults(groups));
    return;
  }

  const tree = buildTree(groups);

  if (isMobile()) {
    elements.groups.appendChild(renderGroupsMobile(tree));
  } else {
    elements.groups.appendChild(renderGroupsDesktop(tree));
  }
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
  const updateClearButton = () => {
    elements.clearSearch.classList.toggle("hidden", !state.searchTerm);
  };

  elements.searchInput.addEventListener("input", (event) => {
    state.searchTerm = event.target.value;
    updateClearButton();
    render();
  });

  elements.clearSearch.addEventListener("click", () => {
    state.searchTerm = "";
    elements.searchInput.value = "";
    updateClearButton();
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
      elements.title.textContent = state.siteTitle || DEFAULT_TITLE;
      elements.description.textContent = state.siteSlogan || DEFAULT_SLOGAN;
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
  elements.saveTitle.addEventListener("click", () => {
    state.siteTitle = elements.customTitle.value.trim() || DEFAULT_TITLE;
    state.siteSlogan = elements.customSlogan.value.trim() || DEFAULT_SLOGAN;
    localStorage.setItem(TITLE_KEY, state.siteTitle);
    localStorage.setItem(SLOGAN_KEY, state.siteSlogan);
    elements.title.textContent = state.siteTitle;
    elements.description.textContent = state.siteSlogan;
    document.title = state.siteTitle;
    if (state.tree) syncDataFromTree();
  });

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

  elements.exportJson.addEventListener("click", () => {
    const payload = {
      data: state.data,
      colors: state.colors,
      siteTitle: state.siteTitle,
      siteSlogan: state.siteSlogan,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nav-backup.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  elements.importJson.addEventListener("click", () => {
    elements.importJsonFile.click();
  });

  elements.importJsonFile.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload.data && payload.data.groups) {
        state.data = payload.data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
      }
      if (payload.colors) {
        state.colors = { ...DEFAULT_COLORS, ...payload.colors };
        saveColors(state.colors);
      }
      if (payload.siteTitle) {
        state.siteTitle = payload.siteTitle;
        localStorage.setItem(TITLE_KEY, state.siteTitle);
      }
      if (payload.siteSlogan) {
        state.siteSlogan = payload.siteSlogan;
        localStorage.setItem(SLOGAN_KEY, state.siteSlogan);
      }
      state.tree = buildTree(state.data.groups || []);
      state.searchTerm = "";
      state.activeTag = "全部";
      state.selectedPath = [];
      elements.searchInput.value = "";
      elements.title.textContent = state.siteTitle || DEFAULT_TITLE;
      elements.description.textContent = state.siteSlogan || DEFAULT_SLOGAN;
      document.title = state.siteTitle || DEFAULT_TITLE;
      render();
    } catch (error) {
      elements.stats.textContent = "导入失败，请确认是正确的备份文件。";
    } finally {
      event.target.value = "";
    }
  });

  const hideTooltip = () => {
    elements.tooltip.classList.add("hidden");
  };
  const hideCtxMenu = () => {
    elements.ctxMenu.classList.add("hidden");
    elements.ctxMenu._target = null;
  };

  document.addEventListener("click", () => { hideTooltip(); hideCtxMenu(); });
  document.addEventListener("scroll", () => { hideTooltip(); hideCtxMenu(); }, true);
  document.addEventListener("keydown", () => { hideTooltip(); hideCtxMenu(); });

  document.addEventListener("contextmenu", (event) => {
    const linkTarget = event.target.closest(".link-card");
    const folderTarget = event.target.closest(".folder-item");
    if (!linkTarget && !folderTarget) return;
    event.preventDefault();
    hideCtxMenu();

    if (linkTarget) {
      const url = linkTarget.dataset.url || "";
      if (url) {
        elements.tooltip.textContent = url;
        elements.tooltip.style.left = `${event.pageX + 12}px`;
        elements.tooltip.style.top = `${event.pageY + 12}px`;
        elements.tooltip.classList.remove("hidden");
      }
      elements.ctxMenu._target = { type: "link", name: linkTarget.querySelector(".link-title")?.textContent, url: linkTarget.dataset.url };
    } else if (folderTarget) {
      elements.ctxMenu._target = { type: "folder", name: folderTarget.querySelector(".folder-name")?.textContent, depth: Number(folderTarget.dataset.depth || 0) };
    }

    elements.ctxMenu.style.left = `${event.pageX + 4}px`;
    elements.ctxMenu.style.top = `${event.pageY + 4}px`;
    elements.ctxMenu.classList.remove("hidden");
  });

  elements.ctxMenu.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    const target = elements.ctxMenu._target;
    if (!action || !target || !state.tree) return;
    hideCtxMenu();

    if (target.type === "folder") {
      const depth = target.depth;
      const folderPath = [...state.selectedPath.slice(0, depth), target.name];
      const node = getNodeByPath(state.tree, folderPath);
      const parent = getParentNode(state.tree, folderPath) || state.tree;
      if (!node) return;

      if (action === "rename") {
        const newName = prompt("重命名文件夹", target.name);
        if (!newName || !newName.trim() || newName.trim() === target.name) return;
        if (parent.children.some((c) => c.name === newName.trim())) return;
        node.name = newName.trim();
        if (state.selectedPath[depth] === target.name) {
          state.selectedPath[depth] = newName.trim();
        }
        syncDataFromTree();
        render();
      } else if (action === "delete") {
        if (!confirm(`确定删除「${target.name}」及其所有内容吗？`)) return;
        parent.children = parent.children.filter((c) => c.name !== target.name);
        if (state.selectedPath[depth] === target.name) {
          state.selectedPath = state.selectedPath.slice(0, depth);
        }
        syncDataFromTree();
        render();
      } else if (action === "move") {
        const allPaths = getAllFolderPaths(state.tree);
        const options = ["根目录", ...allPaths.filter((p) => !isPathPrefix(folderPath, p)).map((p) => p.join(" / "))];
        const choice = prompt("移动到（输入路径或「根目录」）：\n可选：\n" + options.join("\n"), "根目录");
        if (choice === null) return;
        const targetPath = choice === "根目录" ? [] : choice.split(" / ");
        const targetNode = getNodeByPath(state.tree, targetPath) || state.tree;
        if (targetNode.children.some((c) => c.name === node.name)) return;
        parent.children = parent.children.filter((c) => c.name !== target.name);
        targetNode.children.push(node);
        state.selectedPath = [...targetPath, node.name];
        syncDataFromTree();
        render();
      }
    } else if (target.type === "link") {
      const currentNode = getNodeByPath(state.tree, state.selectedPath) || state.tree;
      const linkIndex = currentNode.links.findIndex((l) => l.url === target.url && l.title === target.name);
      if (linkIndex < 0) return;

      if (action === "rename") {
        const newTitle = prompt("修改标题", target.name);
        if (newTitle === null) return;
        const newUrl = prompt("修改网址", target.url);
        if (newUrl === null) return;
        currentNode.links[linkIndex].title = newTitle.trim() || target.url;
        currentNode.links[linkIndex].url = newUrl.trim() || target.url;
        syncDataFromTree();
        render();
      } else if (action === "delete") {
        currentNode.links.splice(linkIndex, 1);
        syncDataFromTree();
        render();
      } else if (action === "move") {
        const allPaths = getAllFolderPaths(state.tree);
        const options = ["根目录", ...allPaths.map((p) => p.join(" / "))];
        const choice = prompt("移动到：\n可选：\n" + options.join("\n"), "根目录");
        if (choice === null) return;
        const targetPath = choice === "根目录" ? [] : choice.split(" / ");
        const targetNode = getNodeByPath(state.tree, targetPath) || state.tree;
        const [link] = currentNode.links.splice(linkIndex, 1);
        targetNode.links.push(link);
        syncDataFromTree();
        render();
      }
    }
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
    data = null;
  }

  state.siteTitle = localStorage.getItem(TITLE_KEY) || DEFAULT_TITLE;
  state.siteSlogan = localStorage.getItem(SLOGAN_KEY) || DEFAULT_SLOGAN;
  state.colors = loadColors();
  applyColors(state.colors);
  elements.title.textContent = state.siteTitle;
  elements.description.textContent = state.siteSlogan;
  document.title = state.siteTitle;
  setupEvents();

  if (!data || !data.groups || !data.groups.length) {
    elements.groups.innerHTML = "";
    const welcome = document.createElement("div");
    welcome.className = "welcome";
    welcome.innerHTML =
      '<h2>定制你自己的导航</h2>' +
      '<div class="welcome-actions">' +
        '<button id="welcome-upload" class="welcome-btn" type="button">上传浏览器书签</button>' +
        '<button id="welcome-new" class="welcome-btn welcome-btn-alt" type="button">从零开始创建</button>' +
      '</div>' +
      '<p>你的数据仅保存在你自己的浏览器中，他人无法看到。</p>';
    elements.groups.appendChild(welcome);

    document.getElementById("welcome-upload").addEventListener("click", () => {
      elements.bookmarkFile.click();
    });
    document.getElementById("welcome-new").addEventListener("click", () => {
      state.data = { title: state.siteTitle, description: state.siteSlogan, groups: [] };
      state.tree = buildTree([]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
      render();
      elements.adminPanel.classList.remove("hidden");
      renderAdminPanel();
    });
    return;
  }

  state.data = data;
  state.tree = buildTree(data.groups || []);
  render();
  updateToggleButton();
  renderAdminPanel();
};

init();
