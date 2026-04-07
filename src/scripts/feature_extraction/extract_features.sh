#!/bin/bash

source .venv/bin/activate
python -m src.scripts.feature_extraction.compute_compact_descriptors "$@"
python -m src.scripts.feature_extraction.compute_track_traits "$@"
