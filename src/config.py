import multiprocessing
import os
import sys
from pathlib import Path

# Must run before numpy (or any package that loads OpenBLAS) is imported.
# NumPy and SciPy ship separate OpenBLAS builds (ILP64 vs LP64) whose
# global thread-pool state can collide, causing SIGSEGV in ufunc inner
# loops.  Pinning each pool to one thread removes the contention surface.
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")


def _invalidate_stale_numba_cache() -> None:
    """Remove cached numba gufunc artefacts when numpy changes version.

    Stale .nbc/.nbi files compiled against a previous numpy build cause
    SIGSEGV in numba's GUFunc dispatch (e.g. librosa pitch tracking).
    """
    import glob
    import site

    try:
        import numpy as np  # noqa: delayed — must not trigger at module scope
    except ImportError:
        return

    sp = site.getsitepackages()
    if not sp:
        return
    site_pkgs = Path(sp[0])
    stamp_file = site_pkgs / ".numba_np_version"

    current = np.__version__
    if stamp_file.exists() and stamp_file.read_text().strip() == current:
        return

    for ext in ("*.nbc", "*.nbi"):
        for p in glob.glob(str(site_pkgs / "**" / ext), recursive=True):
            try:
                os.remove(p)
            except OSError:
                pass

    try:
        stamp_file.write_text(current)
    except OSError:
        pass


_invalidate_stale_numba_cache()

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_REPO_ROOT / ".env")


def _str(key: str, default: str = "") -> str:
    return os.getenv(key, default)


def _int(key: str, default: int) -> int:
    try:
        return int(os.environ[key])
    except (KeyError, ValueError):
        return default


def _float(key: str, default: float) -> float:
    try:
        return float(os.environ[key])
    except (KeyError, ValueError):
        return default


CONFIG = {
    "DATA": {
        "ROOT": _str("DATA_ROOT"),
        "BACKUP_RESTORE_MUSIC_DIR": _str("DATA_BACKUP_RESTORE_MUSIC_DIR"),
        "FILE_STAGING_DIR": _str("DATA_FILE_STAGING_DIR"),
    },
    "DB": {
        "NAME": _str("DB_NAME"),
        "USER": _str("DB_USER"),
        "PASSWORD": _str("DB_PASSWORD"),
        "HOST": _str("DB_HOST", "localhost"),
        "PORT": _str("DB_PORT", "5432"),
    },
    "FEATURE_EXTRACTION": {},
    "HARMONIC_MIXING": {
        "TRANSITION_MATCH_WEIGHTS": {
            "SIMILARITY": _float("HM_WEIGHT_SIMILARITY", 0.1922),
            "CAMELOT": _float("HM_WEIGHT_CAMELOT", 0.2122),
            "BPM": _float("HM_WEIGHT_BPM", 0.2122),
            "FRESHNESS": _float("HM_WEIGHT_FRESHNESS", 0.0922),
            "GENRE_SIMILARITY": _float("HM_WEIGHT_GENRE_SIMILARITY", 0.0922),
            "MOOD_CONTINUITY": _float("HM_WEIGHT_MOOD_CONTINUITY", 0.0722),
            "VOCAL_CLASH": _float("HM_WEIGHT_VOCAL_CLASH", 0.0622),
            "ENERGY": _float("HM_WEIGHT_ENERGY", 0.0522),
            "INSTRUMENT_SIMILARITY": _float("HM_WEIGHT_INSTRUMENT_SIMILARITY", 0.0322),
        },
        "MAX_RESULTS": _int("HM_MAX_RESULTS", 50),
        "SCORE_THRESHOLD": _int("HM_SCORE_THRESHOLD", 25),
        "RESULT_THRESHOLD": _int("HM_RESULT_THRESHOLD", 20),
    },
    "INGESTION_PIPELINE": {
        "ROOT": _str("INGESTION_PIPELINE_ROOT"),
        "UNPROCESSED": _str("INGESTION_PIPELINE_UNPROCESSED", "unprocessed"),
        "PROCESSING": _str("INGESTION_PIPELINE_PROCESSING", "processing"),
        "FINALIZED": _str("INGESTION_PIPELINE_FINALIZED", "finalized"),
        "REKORDBOX_TAG_FILE": _str("INGESTION_PIPELINE_REKORDBOX_TAG_FILE", "rekordbox_tags.txt"),
        "PROCESSED_MUSIC_DIR": _str("INGESTION_PIPELINE_PROCESSED_MUSIC_DIR"),
    },
    "TRACK_METADATA": {
        "DOWNLOAD_DIR": _str("TRACK_METADATA_DOWNLOAD_DIR"),
        "PROCESSING_DIR": _str("TRACK_METADATA_PROCESSING_DIR", "processing"),
        "AUGMENTED_DIR": _str("TRACK_METADATA_AUGMENTED_DIR", "augmented"),
        "LOG_DIR": _str("TRACK_METADATA_LOG_DIR", "logs"),
    },
    "LOG_LOCATION": _str("LOG_LOCATION", "logs/logs.txt"),
}

LOG_LOCATION = CONFIG["LOG_LOCATION"]
PROCESSED_MUSIC_DIR = CONFIG["INGESTION_PIPELINE"]["PROCESSED_MUSIC_DIR"]

IS_UNIX = sys.platform.startswith("darwin") or sys.platform.startswith("linux")
NUM_CORES = _int("NUM_CORES", multiprocessing.cpu_count())

TIMESTAMP_FORMAT = "%a %b %d %H:%M:%S %Y"
