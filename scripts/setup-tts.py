"""One-time online setup. The running app never downloads speech weights."""
from pathlib import Path
from huggingface_hub import snapshot_download

if __name__ == "__main__":
    destination = Path(__file__).resolve().parents[1] / "data/models/omnivoice"
    snapshot_download(
        "k2-fsa/OmniVoice", local_dir=destination,
        allow_patterns=["*.json", "*.safetensors", "README.md"],
    )
    print(f"Tagalog voice installed at {destination}. Model license: CC-BY-NC (see model README).")
