# External References

Guides for key external dependencies used in this repository.
Agents should consult these when working with unfamiliar libraries.

## Core Dependencies

| Library | Version | Purpose | Reference |
|---------|---------|---------|-----------|
| SQLAlchemy | (see requirements.txt) | ORM and database session management | [SQLAlchemy docs](https://docs.sqlalchemy.org/) |
| psycopg2 | (see requirements.txt) | PostgreSQL adapter | [psycopg2 docs](https://www.psycopg.org/docs/) |
| librosa | (see requirements.txt) | Audio feature extraction (CQT, mel spectrograms) | [librosa docs](https://librosa.org/doc/) |
| soundfile | (see requirements.txt) | Audio file I/O | [soundfile docs](https://pysoundfile.readthedocs.io/) |
| mutagen | (see requirements.txt) | Audio metadata (ID3 tags, AIFF tags) | [mutagen docs](https://mutagen.readthedocs.io/) |
| numpy | (see requirements.txt) | Numerical arrays and operations | [numpy docs](https://numpy.org/doc/) |
| scipy | (see requirements.txt) | Scientific computing (signal processing) | [scipy docs](https://docs.scipy.org/doc/scipy/) |
| networkx | (see requirements.txt) | Graph operations (harmonic mixing) | [networkx docs](https://networkx.org/documentation/) |
| python-dotenv | (see requirements.txt) | Environment variable loading | [dotenv docs](https://saurabh-kumar.com/python-dotenv/) |

## Audio Processing Notes

- CQT (Constant-Q Transform) is the primary spectral representation for compact descriptors
- librosa's `n_fft` parameter should be validated against audio file duration to avoid warnings
- Short audio files (< minimum CQT window) should raise `ValueError`, not silently produce garbage

## Database Notes

- PostgreSQL is the only supported backend
- Sequences follow the pattern `<table>_id_seq`
- Session management uses SQLAlchemy's scoped session pattern

## Adding References

When introducing a new dependency or working with an unfamiliar library:
1. Add a row to the table above
2. If the library has complex usage patterns relevant to this repo, add a dedicated
   `<library>-reference.md` file in this directory
