#!/usr/bin/env python3
"""Zhipu GLM vision: recognize a local image, video, or file.

Usage:
    python zhipu_vision.py <path> [--prompt "..."] [--model glm-4.6v-flash] [--api-key KEY] [--thinking]

Environment:
    Z_AI_API_KEY or ZHIPU_API_KEY (required unless --api-key is passed)
"""

import argparse
import base64
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request

API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
DEFAULT_MODELS = ["glm-4.6v-flash", "glm-4v-flash"]
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_VIDEO_BYTES = 8 * 1024 * 1024

MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def guess_mime(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext in MIME_BY_EXT:
        return MIME_BY_EXT[ext]
    return mimetypes.guess_type(path)[0] or "application/octet-stream"


def classify(mime: str) -> str:
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    return "file"


def build_payload(path: str, prompt: str, model: str, thinking: bool) -> dict:
    mime = guess_mime(path)
    kind = classify(mime)
    with open(path, "rb") as fh:
        b64 = base64.b64encode(fh.read()).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"
    if kind == "image":
        item = {"type": "image_url", "image_url": {"url": data_url}}
    elif kind == "video":
        item = {"type": "video_url", "video_url": {"url": data_url}}
    else:
        item = {"type": "file_url", "file_url": {"url": data_url}}
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [item, {"type": "text", "text": prompt}],
            }
        ],
    }
    if thinking:
        payload["thinking"] = {"type": "enabled"}
    return payload


def call_api(api_key: str, model: str, payload: dict) -> str:
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        body = json.loads(response.read().decode("utf-8"))
    return body["choices"][0]["message"]["content"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Recognize a local image/video/file with Zhipu GLM vision")
    parser.add_argument("path", help="path to the local file")
    parser.add_argument("--prompt", default="请详细描述这个文件的内容，包括其中的文字、主体和关键细节。")
    parser.add_argument("--model", default="", help="model id (default: glm-4.6v-flash, then glm-4v-flash)")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--thinking", action="store_true", help="enable deep-thinking mode")
    args = parser.parse_args()

    if not os.path.isfile(args.path):
        print(f"error: file not found: {args.path}", file=sys.stderr)
        return 1

    api_key = args.api_key or os.environ.get("Z_AI_API_KEY") or os.environ.get("ZHIPU_API_KEY") or ""
    if not api_key:
        print("error: no API key. Set Z_AI_API_KEY/ZHIPU_API_KEY or pass --api-key.", file=sys.stderr)
        return 1

    size = os.path.getsize(args.path)
    mime = guess_mime(args.path)
    kind = classify(mime)
    if kind == "image" and size > MAX_IMAGE_BYTES:
        print(f"warning: image is {size / 1024 / 1024:.1f} MB, over the ~10 MB suggestion", file=sys.stderr)
    if kind == "video" and size > MAX_VIDEO_BYTES:
        print(f"error: video is {size / 1024 / 1024:.1f} MB, over the 8 MB limit. Compress or upload to a URL first.", file=sys.stderr)
        return 1

    models = [args.model] if args.model else DEFAULT_MODELS
    last_error = ""
    for model in models:
        try:
            payload = build_payload(args.path, args.prompt, model, args.thinking)
            print(call_api(api_key, model, payload))
            return 0
        except urllib.error.HTTPError as exc:
            last_error = f"{exc.code}: {exc.read().decode('utf-8', 'replace')}"
            print(f"model {model} failed: {last_error}", file=sys.stderr)
        except Exception as exc:
            last_error = str(exc)
            print(f"model {model} failed: {last_error}", file=sys.stderr)
    print(f"all models failed. last error: {last_error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
