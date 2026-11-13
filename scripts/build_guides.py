"""把每個教學的 GUIDE.src.md 展開成 README.md（網頁／GitHub 閱讀）與 guide.txt（給 Agent 直接讀純文字）。

GUIDE.src.md 裡的 {{FILE:相對路徑}} 會換成該檔案的完整內容，確保文件裡的程式碼就是測過的那一份。
用法：python3 scripts/build_guides.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PATTERN = re.compile(r"\{\{FILE:([^}]+)\}\}")

for src in sorted(ROOT.rglob("GUIDE.src.md")):
    base = src.parent

    def embed(match: re.Match) -> str:
        return (base / match.group(1).strip()).read_text(encoding="utf-8").rstrip("\n")

    text = PATTERN.sub(embed, src.read_text(encoding="utf-8"))
    (base / "README.md").write_text(text, encoding="utf-8")
    (base / "guide.txt").write_text(text, encoding="utf-8")
    print(f"built {base.relative_to(ROOT)}")
