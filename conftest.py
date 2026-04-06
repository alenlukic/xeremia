"""Root conftest — BLAS thread-pool safety and numba cache hygiene.

Must execute before any test module imports numpy/scipy.  Module-level
``os.environ`` writes run during conftest collection, which precedes
test-module imports.

NumPy bundles libopenblas64_ (ILP64) while SciPy bundles libopenblas
(LP64).  Both libraries initialise their own global thread pools; when
both are active in the same process the shared global state can corrupt,
producing SIGSEGV inside ufunc inner loops.  Restricting each pool to a
single worker thread eliminates the race.

Stale numba gufunc cache files (.nbc/.nbi) compiled against a previous
numpy build can also cause SIGSEGV in librosa's pitch-tracking path.
We invalidate them on first import by recording the numpy version and
clearing the cache when it changes.
"""

import os

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")


def _invalidate_stale_numba_cache() -> None:
    """Remove cached numba gufunc artefacts when numpy changes version."""
    import glob
    import pathlib
    import site

    try:
        import numpy as np
    except ImportError:
        return

    sp = site.getsitepackages()
    if not sp:
        return
    site_pkgs = pathlib.Path(sp[0])
    stamp_file = site_pkgs / ".numba_np_version"

    current = np.__version__
    if stamp_file.exists() and stamp_file.read_text().strip() == current:
        return

    for ext in ("*.nbc", "*.nbi"):
        for path in glob.glob(str(site_pkgs / "**" / ext), recursive=True):
            try:
                os.remove(path)
            except OSError:
                pass

    try:
        stamp_file.write_text(current)
    except OSError:
        pass


_invalidate_stale_numba_cache()
