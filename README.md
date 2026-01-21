# 导航网站使用说明

## 1. 导出浏览器书签

- Chrome/Edge: 书签管理器 → 右上角三点 → 导出书签
- Safari: 文件 → 导出书签

将导出的 `bookmarks.html` 放在任意位置即可。

## 2. 导入书签生成数据

在当前目录执行：

```bash
python import_bookmarks.py /path/to/bookmarks.html
```

完成后会生成 `data.json`，导航页会自动读取。

## 3. 打开导航页

直接双击 `index.html` 即可使用。
