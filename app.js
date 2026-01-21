const state = {
  data: null,
  searchTerm: "",
  activeTag: "全部",
};

const elements = {
  title: document.getElementById("site-title"),
  description: document.getElementById("site-description"),
  stats: document.getElementById("stats"),
  tagFilters: document.getElementById("tag-filters"),
  groups: document.getElementById("groups"),
  searchInput: document.getElementById("search-input"),
  clearSearch: document.getElementById("clear-search"),
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

const buildTagIndex = (groups) => {
  const tags = new Set();
  groups.forEach((group) => {
    group.links.forEach((link) => {
      (link.tags || []).forEach((tag) => tags.add(tag));
    });
  });
  return ["全部", ...Array.from(tags).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))];
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
  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "group";

    const header = document.createElement("div");
    header.className = "group-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "group-title-wrap";

    const dot = document.createElement("span");
    dot.className = "group-dot";
    dot.style.backgroundColor = pickGroupColor(group.name);

    const title = document.createElement("h2");
    title.className = "group-title";
    title.textContent = group.name;

    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = `${group.links.length} 条链接`;

    titleWrap.appendChild(dot);
    titleWrap.appendChild(title);
    header.appendChild(titleWrap);
    header.appendChild(count);

    const grid = document.createElement("div");
    grid.className = "link-grid";

    group.links.forEach((link) => {
      const card = elements.cardTemplate.content.cloneNode(true);
      card.querySelector(".link-title").textContent = link.title || link.url;
      const urlNode = card.querySelector(".link-url");
      urlNode.href = link.url;
      urlNode.textContent = link.url;
      const descNode = card.querySelector(".link-desc");
      descNode.textContent = link.desc || "暂无描述";

      const tagsNode = card.querySelector(".link-tags");
      (link.tags || []).forEach((tag) => {
        const tagEl = document.createElement("span");
        tagEl.className = "link-tag";
        tagEl.textContent = tag;
        tagsNode.appendChild(tagEl);
      });

      grid.appendChild(card);
    });

    section.appendChild(header);
    section.appendChild(grid);
    elements.groups.appendChild(section);
  });
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
};

const init = async () => {
  let data = window.NAV_DATA || null;

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
  elements.title.textContent = data.title || "我的导航";
  elements.description.textContent = data.description || "把你的收藏夹整理成清爽的导航页";
  setupEvents();
  render();
};

init();
