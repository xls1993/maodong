import json
import sys
from collections import OrderedDict
from html.parser import HTMLParser
from pathlib import Path


def clean_text(value: str) -> str:
    return " ".join(value.split()).strip()


class BookmarkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.pending_folder = None
        self.in_h3 = False
        self.in_a = False
        self.text_buffer = []
        self.current_link = None
        self.entries = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "h3":
            self.in_h3 = True
            self.text_buffer = []
        elif tag == "a":
            self.in_a = True
            self.text_buffer = []
            self.current_link = {
                "url": attrs_dict.get("href", "").strip(),
                "title": "",
                "desc": "",
                "tags": [],
            }
        elif tag == "dl":
            if self.pending_folder:
                self.stack.append(self.pending_folder)
                self.pending_folder = None

    def handle_endtag(self, tag):
        if tag == "h3":
            self.in_h3 = False
            folder_name = clean_text("".join(self.text_buffer)) or "未命名文件夹"
            self.pending_folder = folder_name
            self.text_buffer = []
        elif tag == "a":
            self.in_a = False
            title = clean_text("".join(self.text_buffer))
            if self.current_link:
                self.current_link["title"] = title
                self.entries.append(
                    {"path": list(self.stack), "link": self.current_link}
                )
            self.current_link = None
            self.text_buffer = []
        elif tag == "dl":
            if self.stack:
                self.stack.pop()

    def handle_data(self, data):
        if self.in_h3 or self.in_a:
            self.text_buffer.append(data)


def build_groups(entries):
    groups = OrderedDict()
    for entry in entries:
        path = entry["path"] or ["未分类"]
        group_name = " / ".join(path)
        groups.setdefault(group_name, []).append(entry["link"])

    return [
        {"name": name, "links": links}
        for name, links in groups.items()
        if links
    ]


def main():
    if len(sys.argv) < 2:
        print("用法: python import_bookmarks.py /path/to/bookmarks.html")
        sys.exit(1)

    source_path = sys.argv[1]
    with open(source_path, "r", encoding="utf-8", errors="ignore") as file:
        content = file.read()

    parser = BookmarkParser()
    parser.feed(content)
    groups = build_groups(parser.entries)

    output = {
        "title": "我的导航",
        "description": "由浏览器书签导入生成",
        "groups": groups,
    }

    output_dir = Path(__file__).resolve().parent
    data_json_path = output_dir / "data.json"
    data_js_path = output_dir / "data.js"

    with open(data_json_path, "w", encoding="utf-8") as file:
        json.dump(output, file, ensure_ascii=False, indent=2)

    with open(data_js_path, "w", encoding="utf-8") as file:
        file.write("window.NAV_DATA = ")
        json.dump(output, file, ensure_ascii=False, indent=2)
        file.write(";\n")

    print(
        f"已导入 {len(parser.entries)} 条链接，生成 {data_json_path} 和 {data_js_path}"
    )


if __name__ == "__main__":
    main()
