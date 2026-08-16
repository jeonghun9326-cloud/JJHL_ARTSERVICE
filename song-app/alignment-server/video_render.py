"""ffmpeg(libx264/libvpx-vp9 + libass)로 노래방 스타일 영상을 렌더링한다.

프론트엔드가 음절 단위 \\kf(karaoke fill) 태그가 들어간 ASS 자막을 만들어 보내면,
배경 영상 위에 그 자막을 구워 넣고 오디오와 합쳐 인코딩한다.
libass가 \\kf의 좌→우 색 채우기를 그대로 렌더링해주므로, 별도의 프레임 드로잉 코드가 필요 없다.

두 가지 출력 모드를 지원한다.
- 일반(mp4, libx264): 단색 배경 위에 자막. 알파 채널이 없어 그대로 최종 영상으로 쓰기 좋다.
- 투명 배경(webm, libvpx-vp9 + yuva420p): mp4/H.264는 알파 채널을 지원하지 않으므로, 다른
  영상 위에 자막만 합성하려면 알파 채널을 지원하는 WebM(VP9)으로 내보내야 한다. CapCut
  Desktop 등 주요 영상 편집 프로그램이 이 조합의 투명 WebM 오버레이를 지원한다.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import tempfile


def find_ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise RuntimeError(
            "ffmpeg를 찾을 수 없습니다. https://ffmpeg.org 에서 설치한 뒤 PATH에 추가해주세요."
        )
    return path


def _normalize_hex_color(hex_color: str) -> str:
    cleaned = hex_color.lstrip("#")
    if len(cleaned) != 6:
        cleaned = "0b0d12"
    return f"0x{cleaned}"


def _escape_ffmpeg_filter_path(path: str) -> str:
    # ffmpeg 필터 인자 파서는 ':'를 key=value 구분자로 쓰므로, Windows 경로의 드라이브 콜론을 이스케이프해야 한다.
    return path.replace("\\", "/").replace(":", "\\:")


# 자막 텍스트/외곽선 색으로는 거의 쓰이지 않을 크로마키용 녹색.
# ass 필터가 알파 채널을 직접 지원하지 않아(실측: 텍스트까지 투명해짐), 불투명 배경에 자막을
# 그린 뒤 이 색만 colorkey로 걷어내 투명하게 만드는 방식을 쓴다.
_CHROMA_KEY_COLOR = "0dff0d"


async def render_karaoke_video(
    audio_bytes: bytes,
    ass_content: str,
    duration_seconds: float,
    background_color: str,
    width: int,
    height: int,
    transparent: bool = False,
) -> bytes:
    ffmpeg_path = find_ffmpeg()

    with tempfile.TemporaryDirectory() as tmp_dir:
        audio_path = os.path.join(tmp_dir, "audio.wav")
        ass_path = os.path.join(tmp_dir, "karaoke.ass")
        output_path = os.path.join(tmp_dir, f"output.{'webm' if transparent else 'mp4'}")

        with open(audio_path, "wb") as f:
            f.write(audio_bytes)
        # 주의: BOM(utf-8-sig)을 붙이면 이 ffmpeg/libass 조합에서 한글이 깨진다 (실측 확인됨).
        # BOM 없는 순수 UTF-8로 써야 한글이 올바르게 렌더링된다.
        with open(ass_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(ass_content)

        ass_filter_path = _escape_ffmpeg_filter_path(ass_path)
        ass_filter = f"ass=filename='{ass_filter_path}'"

        if transparent:
            # ass 필터는 알파 채널을 직접 다루지 못한다(투명 배경에 그리면 텍스트까지 통째로
            # 투명해지는 것을 실측 확인함). 그래서 불투명한 크로마키 색 배경 위에 정상적으로
            # 자막을 그린 뒤, colorkey로 그 배경색만 걷어내 투명하게 만드는 2단계 방식을 쓴다.
            # VP9으로 알파 채널을 유지하려면 auto-alt-ref도 꺼야 한다.
            video_filter = (
                f"{ass_filter},"
                f"colorkey=color=0x{_CHROMA_KEY_COLOR}:similarity=0.15:blend=0.05,"
                f"format=yuva420p"
            )
            background_input = f"color=c=0x{_CHROMA_KEY_COLOR}:s={width}x{height}:d={duration_seconds}:r=30"
            video_codec_args = [
                "-c:v", "libvpx-vp9",
                "-pix_fmt", "yuva420p",
                "-auto-alt-ref", "0",
                "-crf", "24",
                "-b:v", "0",
            ]
            audio_codec_args = ["-c:a", "libopus"]
        else:
            video_filter = ass_filter
            bg_color = _normalize_hex_color(background_color)
            background_input = f"color=c={bg_color}:s={width}x{height}:d={duration_seconds}:r=30"
            video_codec_args = [
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "20",
                "-pix_fmt", "yuv420p",
            ]
            audio_codec_args = ["-c:a", "aac"]

        cmd = [
            ffmpeg_path,
            "-y",
            "-f", "lavfi",
            "-i", background_input,
            "-i", audio_path,
            "-vf", video_filter,
            *video_codec_args,
            *audio_codec_args,
            "-shortest",
            output_path,
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        _, stderr = await proc.communicate()

        if proc.returncode != 0 or not os.path.exists(output_path):
            raise RuntimeError(f"ffmpeg 렌더링 실패: {stderr.decode(errors='ignore')[-2000:]}")

        with open(output_path, "rb") as f:
            return f.read()
