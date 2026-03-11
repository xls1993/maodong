const state = {
  data: null,
  searchTerm: "",
  activeTag: "全部",
  selectedPath: [],
};

const SITE_TITLE = "猫冬吧";
const STORAGE_KEY = "nav_site_data";

const elements = {
  title: document.getElementById("site-title"),
  description: document.getElementById("site-description"),
  stats: document.getElementById("stats"),
  tagFilters: document.getElementById("tag-filters"),
  groups: document.getElementById("groups"),
  searchInput: document.getElementById("search-input"),
  clearSearch: document.getElementById("clear-search"),
  toggleAll: document.getElementById("toggle-all"),
  uploadButton: document.getElementById("upload-bookmarks"),
  bookmarkFile: document.getElementById("bookmark-file"),
  cardTemplate: document.getElementById("link-card-template"),
};

const normalize = (value) => (value || "").toLowerCase().trim();

const palette = [
  "#b8c1c8",
  "#d6c9b8",
  "#cfd6c1",
  "#c8c0b4",
  "#c9d4d6",
  "#d9c6cf",
  "#d3d9cc",
  "#c8d0d8",
];

const hashString = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
  }
  return hash;
};

const pickGroupColor = (name) => palette[hashString(name) % palette.length];

const truncateText = (value, limit) => {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
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

const buildTree = (groups) => {
  const root = { name: "root", children: new Map(), links: [] };

  groups.forEach((group) => {
    const parts = group.name.split(" / ").map((part) => part.trim()).filter(Boolean);
    let node = root;
    parts.forEach((part) => {
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, children: new Map(), links: [] });
      }
      node = node.children.get(part);
    });
    node.links.push(...group.links);
  });

  return root;
};

const countLinks = (node) => {
  let total = node.links.length;
  node.children.forEach((child) => {
    total += countLinks(child);
  });
  return total;
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

  const buildLevelLabel = (depth) => {
    const labels = ["一级", "二级", "三级", "四级", "五级", "六级"];
    return labels[depth] || `第${depth + 1}级`;
  };

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

    Array.from(node.children.values()).forEach((child) => {
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
    const next = current.children.get(state.selectedPath[depth]);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      state.searchTerm = "";
      state.activeTag = "全部";
      elements.searchInput.value = "";
      elements.title.textContent = SITE_TITLE;
      elements.description.textContent = data.description;
      render();
      updateToggleButton();
    } catch (error) {
      elements.stats.textContent = "书签文件解析失败，请确认是 HTML 格式。";
    } finally {
      event.target.value = "";
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
    try {
      const response = await fetch("data.json");
      data = await response.json();
    } catch (error) {
      elements.stats.textContent = "无法读取数据，请重新导入书签。";
      return;
    }
  }

  state.data = data;
  elements.title.textContent = SITE_TITLE;
  document.title = SITE_TITLE;
  elements.description.textContent = data.description || "把你的收藏夹整理成清爽的导航页";
  setupEvents();
  render();
  updateToggleButton();
};

init();
