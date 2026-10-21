"""Render OPENDEX.md into web/manifesto.html and copy the diagrams into web/img/.

Stdlib only. Run from the repo root:  python article/build_manifesto.py
Handles the subset of Markdown the manifesto uses: #/## headings, paragraphs,
*italic* and **bold**, [text](url) links, ![alt](path) images, - bullets, 1. lists.
"""
import html
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "OPENDEX.md"
OUT = ROOT / "web" / "manifesto.html"
IMG_DIR = ROOT / "web" / "img"

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} | opendex</title>
<meta name="description" content="{description}">
<link rel="canonical" href="https://opendex.info/manifesto">
<meta property="og:type" content="article">
<meta property="og:site_name" content="opendex">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="https://opendex.info/manifesto">
<meta property="og:image" content="https://opendex.info/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@opendexinfo">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="https://opendex.info/og.png">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#121317">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root {{
    --bg: oklch(14% 0.012 260);
    --ink: oklch(94% 0.01 260);
    --ink-2: oklch(70% 0.02 260);
    --line: oklch(28% 0.015 260);
    --wash: oklch(18% 0.014 260);
    --acc: oklch(80% 0.17 150);
    --bad: oklch(72% 0.17 25);
    color-scheme: dark;
  }}
  * {{ box-sizing: border-box; }}
  html {{ -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }}
  @media (prefers-reduced-motion: reduce) {{ html {{ scroll-behavior: auto; }} }}
  body {{ margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.65 "JetBrains Mono", ui-monospace, Menlo, monospace; }}
  a {{ color: var(--ink); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }}
  a:hover {{ color: var(--acc); }}
  main {{ max-width: 980px; margin: 0 auto; padding: 32px 16px 96px; }}
  @media (min-width: 640px) {{ main {{ padding: 32px 24px 96px; }} }}

  nav {{ display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--line); font-size: 14px; }}
  nav b {{ font-weight: 700; }}
  nav b a {{ text-decoration: none; }}
  nav span {{ color: var(--ink-2); display: flex; flex-wrap: wrap; justify-content: flex-end; column-gap: 18px; }}
  nav a {{ text-decoration: none; color: var(--ink-2); display: inline-block; padding: 6px 0; }}
  nav a:hover {{ color: var(--acc); }}

  article > :not(figure) {{ max-width: 648px; margin-inline: auto; }}
  h1 {{ font-weight: 500; font-size: clamp(30px, 6vw, 64px); line-height: 1.02; letter-spacing: -0.03em; margin: 64px auto 20px; text-wrap: balance; }}
  h1 em {{ font-style: normal; color: var(--acc); }}
  .lede {{ color: var(--ink-2); font-style: italic; margin: 0 auto 40px; text-wrap: pretty; }}
  h2 {{ font-weight: 700; font-size: 15px; margin: 72px 0 16px; padding-top: 20px; border-top: 1px dashed var(--line); text-wrap: balance; }}
  h2 .n {{ color: var(--acc); margin-right: 1ch; }}
  p {{ margin: 0 0 18px; text-wrap: pretty; }}
  p strong {{ font-weight: 700; }}
  ul, ol {{ margin: 0 0 18px; padding-left: 2.5ch; }}
  li {{ margin-bottom: 10px; text-wrap: pretty; }}
  li::marker {{ color: var(--ink-2); }}
  figure {{ margin: 28px 0 32px; }}
  figure img {{ display: block; width: 100%; height: auto; border: 1px solid var(--line); background: var(--wash); }}
  figure.cover {{ margin-top: 0; }}
  .sources {{ margin-top: 56px; padding-top: 20px; border-top: 1px dashed var(--line); color: var(--ink-2); font-size: 14px; }}
  .tldr {{ border: 1px dashed var(--line); padding: 18px 20px 8px; margin: 0 auto 24px; }}
  .tldr ul {{ margin: 0 0 10px; }}
  .foot {{ margin-top: 72px; padding-top: 20px; border-top: 1px solid var(--line); color: var(--ink-2); font-size: 14px; display: flex; gap: 16px; flex-wrap: wrap; }}
</style>
</head>
<body>
<main>
  <nav><b><a href="/">opendex</a></b><span><a href="/">check a token</a> <a href="/#recent">recent</a> <a href="/#creator">write</a> <a href="https://github.com/teop23/opendex">source</a></span></nav>
  <article>
{body}
  </article>
  <p class="foot"><a href="./">Check a token</a><a href="https://github.com/teop23/opendex">GitHub</a><a href="https://x.com/opendexinfo">@opendexinfo</a><a href="https://github.com/teop23/opendex/blob/main/OPENDEX.md">This text as Markdown</a></p>
</main>
</body>
</html>
"""

INLINE_RULES = [
    (re.compile(r"!\[([^\]]*)\]\(([^)]+)\)"), None),  # images handled per line
    (re.compile(r"\*\*(.+?)\*\*"), r"<strong>\1</strong>"),
    (re.compile(r"(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])"), r"<em>\1</em>"),
    (re.compile(r"\[([^\]]+)\]\(([^)]+)\)"), r'<a href="\2">\1</a>'),
]


def inline(text: str) -> str:
    out = html.escape(text, quote=False)
    for rx, rep in INLINE_RULES:
        if rep is not None:
            out = rx.sub(rep, out)
    return out


def render(md: str) -> tuple[str, str, str]:
    lines = md.splitlines()
    parts: list[str] = []
    title = ""
    description = ""
    para: list[str] = []
    list_kind: str | None = None
    in_tldr = False

    def flush_para():
        nonlocal para, description
        if not para:
            return
        text = " ".join(para).strip()
        para = []
        if text.startswith("*") and text.endswith("*") and not text.startswith("**"):
            body = inline(text[1:-1])
            if not description:
                description = html.escape(re.sub(r"\*", "", text[1:-1]).split(". ")[0] + ".", quote=True)
                parts.append(f'<p class="lede">{body}</p>')
            else:
                parts.append(f'<p class="sources">{body}</p>')
        else:
            parts.append(f"<p>{inline(text)}</p>")

    def close_list():
        nonlocal list_kind
        if list_kind:
            parts.append(f"</{list_kind}>")
            list_kind = None

    def close_tldr():
        nonlocal in_tldr
        if in_tldr:
            parts.append("</div>")
            in_tldr = False

    for raw in lines:
        line = raw.rstrip()
        if not line:
            flush_para()
            close_list()
            continue
        if line.startswith("# "):
            flush_para(); close_list()
            title = line[2:].strip()
            h = inline(title)
            h = h.replace("$299", "<em>$299</em>", 1)
            parts.append(f"<h1>{h}</h1>")
            continue
        if line.startswith("## "):
            flush_para(); close_list(); close_tldr()
            head = line[3:].strip()
            m = re.match(r"(\d+)\.\s+(.*)", head)
            anchor = re.sub(r"[^a-z0-9]+", "-", head.lower()).strip("-")
            if m:
                parts.append(f'<h2 id="{anchor}"><span class="n">{m.group(1)}</span>{inline(m.group(2))}</h2>')
            else:
                parts.append(f'<h2 id="{anchor}">{inline(head)}</h2>')
                if head.lower().startswith("tl;dr"):
                    parts.append('<div class="tldr">')
                    in_tldr = True
            continue
        m = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line)
        if m:
            flush_para(); close_list()
            alt, src = m.group(1), m.group(2)
            name = Path(src).name
            cls = ' class="cover"' if name == "cover.png" else ""
            parts.append(f'<figure{cls}><img src="img/{name}" alt="{html.escape(alt, quote=True)}" loading="lazy" decoding="async"></figure>')
            continue
        m = re.match(r"- (.*)", line)
        if m:
            flush_para()
            if list_kind != "ul":
                if list_kind:
                    parts.append(f"</{list_kind}>")
                parts.append("<ul>")
                list_kind = "ul"
            parts.append(f"<li>{inline(m.group(1))}</li>")
            continue
        m = re.match(r"\d+\. (.*)", line)
        if m:
            flush_para()
            if list_kind != "ol":
                if list_kind:
                    parts.append(f"</{list_kind}>")
                parts.append("<ol>")
                list_kind = "ol"
            parts.append(f"<li>{inline(m.group(1))}</li>")
            continue
        para.append(line)

    flush_para()
    close_list()
    close_tldr()
    return title, description, "\n".join(parts)


def main() -> None:
    md = SRC.read_text(encoding="utf-8")
    title, description, body = render(md)
    IMG_DIR.mkdir(exist_ok=True)
    for png in (ROOT / "article").glob("*.png"):
        shutil.copyfile(png, IMG_DIR / png.name)
    OUT.write_text(
        TEMPLATE.format(title=html.escape(title, quote=True), description=description, body=body),
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes), {len(list(IMG_DIR.glob('*.png')))} images")


if __name__ == "__main__":
    main()
