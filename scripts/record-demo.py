#!/usr/bin/env python3
"""錄製 RoomList 跨電商採購清單的 README 操作示範。

輸出：
  docs/assets/roomlist-multi-store-demo.mp4
  docs/assets/roomlist-multi-store-demo.gif
  docs/assets/roomlist-multi-store-demo-poster.png

腳本會建立一份暫存擴充功能副本，並只在該副本中將 window.print()
換成可錄製的提示訊息。正式擴充功能原始碼不會被修改。
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import Locator, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = ROOT / "docs" / "assets"
PRODUCTS = [
    (
        "PChome",
        "https://24h.pchome.com.tw/prod/DEDDBX-A900BZSB2?fq=/S/DQCE0N",
        "客廳",
        5_000,
    ),
    (
        "momo",
        "https://www.momoshop.com.tw/product/11301646?Area=search&mdiv=403&oid=1_2&cid=index&kw=%E5%BA%8A%E5%A2%8A&ecTagNos=",
        "臥室",
        5_000,
    ),
    (
        "IKEA",
        "https://www.ikea.com.tw/zh/products/bedlinen/quilt-covers/lakevanderot-art-10606503",
        "臥室",
        6_500,
    ),
    (
        "NITORI",
        "https://www.nitori-net.tw/product/2110100019845s",
        "餐廳",
        4_500,
    ),
]
VIEWPORT = {"width": 1440, "height": 900}
TRANSITION_SECONDS = 0.4


def run(command: list[str]) -> None:
    """執行外部指令，失敗時直接顯示原始錯誤。"""
    subprocess.run(command, check=True, cwd=ROOT)


def require_command(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"找不到 {name}，請先安裝後再執行。")


def media_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def make_recording_extension(destination: Path) -> Path:
    """複製正式擴充功能，並讓 PDF 預覽不叫出系統列印視窗。"""
    extension_dir = destination / "extension"
    shutil.copytree(
        ROOT,
        extension_dir,
        ignore=shutil.ignore_patterns(".git", ".DS_Store", "docs", "scripts"),
    )

    panel_path = extension_dir / "content" / "panel.js"
    panel_source = panel_path.read_text(encoding="utf-8")
    print_call = "      w.print();"
    if panel_source.count(print_call) != 1:
        raise RuntimeError("找不到唯一的 w.print()，請更新錄影腳本的 PDF 攔截邏輯。")

    recording_note = """      const note = w.document.createElement(\"div\");
      note.textContent = \"在 Chrome 列印視窗選擇「另存為 PDF」即可完成匯出\";
      Object.assign(note.style, {
        position: \"fixed\", left: \"50%\", bottom: \"30px\", transform: \"translateX(-50%)\",
        zIndex: \"2147483647\", padding: \"13px 22px\", borderRadius: \"999px\",
        background: \"rgba(17,17,17,.9)\", color: \"#fff\", font: \"600 17px/1.35 system-ui\",
        boxShadow: \"0 8px 28px rgba(0,0,0,.28)\"
      });
      w.document.body.appendChild(note);"""
    panel_path.write_text(panel_source.replace(print_call, recording_note), encoding="utf-8")
    return extension_dir


def pause(page: Page, milliseconds: int = 900) -> None:
    page.wait_for_timeout(milliseconds)


def caption(page: Page, text: str) -> None:
    page.evaluate(
        """text => {
          let el = document.getElementById('__demo_caption__');
          if (!el) {
            el = document.createElement('div');
            el.id = '__demo_caption__';
            Object.assign(el.style, {
              position:'fixed', left:'50%', bottom:'28px', transform:'translate(-50%, 8px)',
              opacity:'0', zIndex:'2147483647', padding:'12px 21px', borderRadius:'999px',
              background:'rgba(17,17,17,.88)', color:'#fff', font:'600 17px/1.35 system-ui',
              boxShadow:'0 8px 28px rgba(0,0,0,.3)', pointerEvents:'none',
              transition:'opacity .25s ease, transform .25s ease', whiteSpace:'nowrap'
            });
            document.documentElement.appendChild(el);
            requestAnimationFrame(() => {
              el.style.opacity = '1';
              el.style.transform = 'translate(-50%, 0)';
            });
          }
          el.textContent = text;
        }""",
        text,
    )


def smooth_click(page: Page, locator: Locator) -> None:
    locator.scroll_into_view_if_needed()
    box = locator.bounding_box()
    if box:
        page.mouse.move(
            box["x"] + box["width"] / 2,
            box["y"] + box["height"] / 2,
            steps=28,
        )
        pause(page, 350)
    locator.click(force=True)


def dismiss_site_overlays(page: Page) -> None:
    """關閉常見 cookie／活動提示；找不到時直接略過。"""
    for label in ("我明白", "接受所有", "全部接受", "同意", "確定", "關閉"):
        try:
            page.get_by_text(label, exact=True).first.click(timeout=700)
        except Exception:
            pass


def add_product_to_room(page: Page, store: str, url: str, room: str, load_wait: int) -> None:
    page.goto(url, wait_until="domcontentloaded", timeout=90_000)
    page.wait_for_selector("#__roomlist_wishlist_host__", state="attached", timeout=30_000)
    pause(page, load_wait)
    dismiss_site_overlays(page)

    quick_add = page.locator("#__roomlist_wishlist_host__ #plannerQuickAdd")
    quick_add.wait_for(state="visible", timeout=30_000)
    caption(page, f"{store} 商品加入「{room}」空間")
    pause(page, 1_100)
    smooth_click(page, quick_add)

    modal = page.locator("#__roomlist_wishlist_host__ #plannerAddScrim")
    modal.wait_for(state="visible", timeout=10_000)
    room_select = page.locator("#__roomlist_wishlist_host__ #plannerAddRoom")
    room_select.select_option(label=room)
    pause(page, 750)
    smooth_click(page, page.locator("#__roomlist_wishlist_host__ #btnConfirmPlannerAdd"))
    pause(page, 1_300)


def record(extension_dir: Path, work_dir: Path) -> tuple[Path, Path, float]:
    """錄製四個電商商品加入空間，最後呈現 PDF 匯出預覽。"""
    profile_dir = work_dir / "chrome-profile"
    video_dir = work_dir / "video"
    video_dir.mkdir()

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            str(profile_dir),
            headless=False,
            viewport=VIEWPORT,
            record_video_dir=str(video_dir),
            record_video_size=VIEWPORT,
            args=[
                f"--disable-extensions-except={extension_dir}",
                f"--load-extension={extension_dir}",
                "--no-first-run",
            ],
        )
        recording_started = time.monotonic()
        page = context.pages[0] if context.pages else context.new_page()
        first_store, first_url, first_room, first_wait = PRODUCTS[0]
        add_product_to_room(page, first_store, first_url, first_room, first_wait)
        # 從第一個商品頁已穩定顯示時開始，移除最前面的網站載入畫面。
        trim_start = max(0.0, time.monotonic() - recording_started - 4.8)
        for store, url, room, load_wait in PRODUCTS[1:]:
            add_product_to_room(page, store, url, room, load_wait)

        caption(page, "跨電商商品，依空間集中整理")
        smooth_click(page, page.locator("#__roomlist_wishlist_host__ #tab"))
        pause(page, 2_600)
        caption(page, "4 項商品已分類，總金額自動加總")
        pause(page, 2_600)

        caption(page, "點選「匯出 PDF」產生採購清單")
        pdf_button = page.locator("#__roomlist_wishlist_host__ #btnPdf")
        pdf_button.scroll_into_view_if_needed()
        pause(page, 700)
        with context.expect_page(timeout=10_000) as popup_info:
            smooth_click(page, pdf_button)
        export_page = popup_info.value
        pause(page, 900)

        export_page.bring_to_front()
        export_page.wait_for_load_state("domcontentloaded")
        pause(export_page, 4_800)

        main_video_object = page.video
        export_video_object = export_page.video
        context.close()
        return Path(main_video_object.path()), Path(export_video_object.path()), trim_start


def build_assets(main_video: Path, export_video: Path, trim_start: float) -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    mp4_path = ASSETS_DIR / "roomlist-multi-store-demo.mp4"
    gif_path = ASSETS_DIR / "roomlist-multi-store-demo.gif"
    poster_path = ASSETS_DIR / "roomlist-multi-store-demo-poster.png"

    main_duration = media_duration(main_video)
    trimmed_main_duration = main_duration - trim_start
    if trimmed_main_duration <= TRANSITION_SECONDS:
        raise RuntimeError("主影片太短，無法進行剪輯。")
    transition_offset = trimmed_main_duration - TRANSITION_SECONDS

    run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(main_video),
            "-i",
            str(export_video),
            "-filter_complex",
            (
                f"[0:v]trim=start={trim_start:.3f},setpts=PTS-STARTPTS,"
                "fps=25,format=yuv420p[v0];"
                "[1:v]setpts=PTS-STARTPTS,fps=25,format=yuv420p[v1];"
                f"[v0][v1]xfade=transition=fade:duration={TRANSITION_SECONDS}:"
                f"offset={transition_offset:.3f}[outv]"
            ),
            "-map",
            "[outv]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "22",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(mp4_path),
        ]
    )

    run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(mp4_path),
            "-filter_complex",
            (
                "fps=10,scale=960:-1:flags=lanczos,split[s0][s1];"
                "[s0]palettegen=max_colors=128[p];"
                "[s1][p]paletteuse=dither=bayer"
            ),
            str(gif_path),
        ]
    )

    final_duration = media_duration(mp4_path)
    poster_time = max(0.5, final_duration - 2.5)
    run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{poster_time:.3f}",
            "-i",
            str(mp4_path),
            "-frames:v",
            "1",
            "-update",
            "1",
            str(poster_path),
        ]
    )

    print("\n錄影完成：")
    print(f"- {mp4_path.relative_to(ROOT)}")
    print(f"- {gif_path.relative_to(ROOT)}")
    print(f"- {poster_path.relative_to(ROOT)}")


def main() -> None:
    require_command("ffmpeg")
    require_command("ffprobe")
    with tempfile.TemporaryDirectory(prefix="ikea-wishlist-demo-") as temp:
        work_dir = Path(temp)
        extension_dir = make_recording_extension(work_dir)
        main_video, export_video, trim_start = record(extension_dir, work_dir)
        build_assets(main_video, export_video, trim_start)


if __name__ == "__main__":
    main()
