from __future__ import annotations

import pytest

from src.track_metadata.audio_features import (
    BPM_ANALYZER_PRIORITY,
    KEY_ANALYZER_PRIORITY,
    _canonicalize_key,
    _normalize_bpm,
    bpm_values_octave_related,
    fuse_bpm,
    fuse_key,
)

CALIBRATION_FIXTURE = [
    {
        "file": "[01A - Abm - 126] Amandra - Dame De Bahia (Agents Of Time Remix).mp3",
        "ground_truth_bpm": 126.0,
        "ground_truth_key": "Abm",
        "bpm": {"madmom": 125.00000000000267, "librosa": 123.046875, "essentia": 126.0107192993164},
        "key": {"madmom": "Abm", "librosa": "Abm", "essentia": "Abm"},
    },
    {
        "file": "[01A - Abm - 135] Armin van Buuren ft. Airwave - Slipstream.mp3",
        "ground_truth_bpm": 135.0,
        "ground_truth_key": "Abm",
        "bpm": {"madmom": 136.36363636363265, "librosa": 135.99917763157896, "essentia": 135.17236328125},
        "key": {"madmom": "Abm", "librosa": "Abm", "essentia": "Abm"},
    },
    {
        "file": "[01B - B - 124] deadmau5 - Strobe (ATTLAS Remix).mp3",
        "ground_truth_bpm": 124.0,
        "ground_truth_key": "B",
        "bpm": {"madmom": 124.99999999999527, "librosa": 123.046875, "essentia": 123.84402465820312},
        "key": {"madmom": "B", "librosa": "Abm", "essentia": "B"},
    },
    {
        "file": "[01B - B - 138] Underwater - Water Planet (Activa's Liquid Globe Remix).mp3",
        "ground_truth_bpm": 138.0,
        "ground_truth_key": "B",
        "bpm": {"madmom": 139.534883720928, "librosa": 135.99917763157896, "essentia": 137.9698944091797},
        "key": {"madmom": "Bbm", "librosa": "Bbm", "essentia": "Bbm"},
    },
    {
        "file": "[02A - Ebm - 138.00] Egorythmia & Fractal Joke - Uncanny Valley.mp3",
        "ground_truth_bpm": 138.0,
        "ground_truth_key": "Ebm",
        "bpm": {"madmom": 136.36363636363706, "librosa": 135.99917763157896, "essentia": 137.03515625},
        "key": {"madmom": "Ebm", "librosa": "Ebm", "essentia": "Ebm"},
    },
    {
        "file": "[02A - Ebm - 176.47] Michael McCann - Detroit Marketplace.mp3",
        "ground_truth_bpm": 176.47,
        "ground_truth_key": "Ebm",
        "bpm": {"madmom": 176.47058823529235, "librosa": 117.45383522727273, "essentia": 178.2061309814453},
        "key": {"madmom": "Ebm", "librosa": "Ebm", "essentia": "Ebm"},
    },
    {
        "file": "[02B - F# - 120.00] Makebo - You.mp3",
        "ground_truth_bpm": 120.0,
        "ground_truth_key": "F#",
        "bpm": {"madmom": 120.0, "librosa": 117.45383522727273, "essentia": 119.97759246826172},
        "key": {"madmom": "F#", "librosa": "F#m", "essentia": "F#"},
    },
    {
        "file": "[02B - F# - 122.00] Monojoke - Manila (Rauschhaus Remix).mp3",
        "ground_truth_bpm": 122.0,
        "ground_truth_key": "F#",
        "bpm": {"madmom": 122.44897959183446, "librosa": 123.046875, "essentia": 122.03827667236328},
        "key": {"madmom": "F#m", "librosa": "F#m", "essentia": "F#"},
    },
    {
        "file": "[03A - Bbm - 121] Stephan Bodzin - Singularity.mp3",
        "ground_truth_bpm": 121.0,
        "ground_truth_key": "Bbm",
        "bpm": {"madmom": 120.0, "librosa": 123.046875, "essentia": 120.9671859741211},
        "key": {"madmom": "Bbm", "librosa": "Bbm", "essentia": "Bbm"},
    },
    {
        "file": "[03A - Bbm - 137.99] Dekel - Oasis.aiff",
        "ground_truth_bpm": 137.99,
        "ground_truth_key": "Bbm",
        "bpm": {"madmom": 136.36363636363706, "librosa": 135.99917763157896, "essentia": 138.04345703125},
        "key": {"madmom": "Bbm", "librosa": "Bbm", "essentia": "Bbm"},
    },
    {
        "file": "[03B - Db - 135] Sven Vath - Robot (Hardfloor Remix).mp3",
        "ground_truth_bpm": 135.0,
        "ground_truth_key": "Db",
        "bpm": {"madmom": 136.36363636363706, "librosa": 135.99917763157896, "essentia": 135.54074096679688},
        "key": {"madmom": "Db", "librosa": "Abm", "essentia": "Db"},
    },
    {
        "file": "[03B - Db - 137.00] Jones & Stephenson - The First Rebirth (John 00 Fleming Remix).mp3",
        "ground_truth_bpm": 137.0,
        "ground_truth_key": "Db",
        "bpm": {"madmom": 136.36363636363706, "librosa": 135.99917763157896, "essentia": 136.94566345214844},
        "key": {"madmom": "C#m", "librosa": "Abm", "essentia": "C#m"},
    },
    {
        "file": "[04A - Fm - 116.99] Koreless - White Picket Fence.aiff",
        "ground_truth_bpm": 116.99,
        "ground_truth_key": "Fm",
        "bpm": {"madmom": 115.38461538461942, "librosa": 117.45383522727273, "essentia": 117.1145248413086},
        "key": {"madmom": "Fm", "librosa": "Fm", "essentia": "Fm"},
    },
    {
        "file": "[04A - Fm - 146.00] Frank Heise - Abort To Orbit.aiff",
        "ground_truth_bpm": 146.0,
        "ground_truth_key": "Fm",
        "bpm": {"madmom": 146.34146341463537, "librosa": 143.5546875, "essentia": 146.05506896972656},
        "key": {"madmom": "Fm", "librosa": "Fm", "essentia": "Fm"},
    },
    {
        "file": "[04B - Ab - 140.00] Ayumi Hamasaki - Evolution (Goldenscan Club Mix).mp3",
        "ground_truth_bpm": 140.0,
        "ground_truth_key": "Ab",
        "bpm": {"madmom": 139.534883720928, "librosa": 143.5546875, "essentia": 139.96142578125},
        "key": {"madmom": "Abm", "librosa": "Abm", "essentia": "Abm"},
    },
    {
        "file": "[04B - Ab - 140] Cosmic Gate - Fire Wire (Scot Project Remix).mp3",
        "ground_truth_bpm": 140.0,
        "ground_truth_key": "Ab",
        "bpm": {"madmom": 139.534883720928, "librosa": 143.5546875, "essentia": 139.9969940185547},
        "key": {"madmom": "Abm", "librosa": "Abm", "essentia": "Ab"},
    },
    {
        "file": "[05A - Cm - 135.00] Chiqeau - Cherchez La Femme (Chiqeau Mix).aiff",
        "ground_truth_bpm": 135.0,
        "ground_truth_key": "Cm",
        "bpm": {"madmom": 136.36363636363487, "librosa": 135.99917763157896, "essentia": 135.03587341308594},
        "key": {"madmom": "Cm", "librosa": "Cm", "essentia": "Cm"},
    },
    {
        "file": "[05A - Cm - 152.95] Alpha Tracks - October_03.aiff",
        "ground_truth_bpm": 152.95,
        "ground_truth_key": "Cm",
        "bpm": {"madmom": 74.07407407407386, "librosa": 123.046875, "essentia": 152.2580108642578},
        "key": {"madmom": "Cm", "librosa": "Cm", "essentia": "Cm"},
    },
    {
        "file": "[05B - Eb - 130] Tilt - Twelve.mp3",
        "ground_truth_bpm": 130.0,
        "ground_truth_key": "Eb",
        "bpm": {"madmom": 130.43478260869338, "librosa": 129.19921875, "essentia": 129.9990692138672},
        "key": {"madmom": "Ebm", "librosa": "Ebm", "essentia": "Ebm"},
    },
    {
        "file": "[05B - Eb - 142] Tristan & Avalon - We Are Psychedelic.mp3",
        "ground_truth_bpm": 142.0,
        "ground_truth_key": "Eb",
        "bpm": {"madmom": 142.85714285713743, "librosa": 143.5546875, "essentia": 142.07496643066406},
        "key": {"madmom": "Ebm", "librosa": "Gm", "essentia": "Eb"},
    },
    {
        "file": "[06A - Gm - 140.00] Altinbas - Biosfera.mp3",
        "ground_truth_bpm": 140.0,
        "ground_truth_key": "Gm",
        "bpm": {"madmom": 139.534883720928, "librosa": 143.5546875, "essentia": 139.9941864013672},
        "key": {"madmom": "Cm", "librosa": "Cm", "essentia": "Cm"},
    },
    {
        "file": "[06A - Gm - 147.00] Katy Perry - Teenage Dream (KICK Remix).mp3",
        "ground_truth_bpm": 147.0,
        "ground_truth_key": "Gm",
        "bpm": {"madmom": 146.34146341463537, "librosa": 143.5546875, "essentia": 147.02804565429688},
        "key": {"madmom": "Gm", "librosa": "Fm", "essentia": "Gm"},
    },
    {
        "file": "[06B - Bb - 123] Stephan Bodzin - Singularity (Fur Coat Remix).mp3",
        "ground_truth_bpm": 123.0,
        "ground_truth_key": "Bb",
        "bpm": {"madmom": 122.44897959183623, "librosa": 123.046875, "essentia": 122.95731353759766},
        "key": {"madmom": "Bbm", "librosa": "Bbm", "essentia": "Bbm"},
    },
    {
        "file": "[06B - Bb - 140] Blade Attack - Seelenwandler (Junk Project Remix).mp3",
        "ground_truth_bpm": 140.0,
        "ground_truth_key": "Bb",
        "bpm": {"madmom": 139.534883720928, "librosa": 143.5546875, "essentia": 139.87783813476562},
        "key": {"madmom": "Bbm", "librosa": "Bbm", "essentia": "Bbm"},
    },
    {
        "file": "[07A - Dm - 125] Perry O'Neil - Afterwards.mp3",
        "ground_truth_bpm": 125.0,
        "ground_truth_key": "Dm",
        "bpm": {"madmom": 124.99999999999896, "librosa": 123.046875, "essentia": 125.00071716308594},
        "key": {"madmom": "Dm", "librosa": "F#m", "essentia": "Dm"},
    },
    {
        "file": "[07A - Dm - 132.00] Ecilo - Moon Landing Conspiracy.mp3",
        "ground_truth_bpm": 132.0,
        "ground_truth_key": "Dm",
        "bpm": {"madmom": 133.33333333332828, "librosa": 129.19921875, "essentia": 131.99156188964844},
        "key": {"madmom": "Dm", "librosa": "Abm", "essentia": "A"},
    },
    {
        "file": "[07B - F - 126.00] Beyonce - Drunk in Love (Glass Half Empty Remix).aiff",
        "ground_truth_bpm": 126.0,
        "ground_truth_key": "F",
        "bpm": {"madmom": 125.00000000000267, "librosa": 123.046875, "essentia": 125.98776245117188},
        "key": {"madmom": "Fm", "librosa": "Fm", "essentia": "Fm"},
    },
    {
        "file": "[07B - F - 135] I Hate Models - Those Shiny Razor Blades.mp3",
        "ground_truth_bpm": 135.0,
        "ground_truth_key": "F",
        "bpm": {"madmom": 136.36363636363265, "librosa": 135.99917763157896, "essentia": 135.22837829589844},
        "key": {"madmom": "Fm", "librosa": "Am", "essentia": "Fm"},
    },
    {
        "file": "[08A - Am - 137.00] Omformer - Interstellar Infection.aiff",
        "ground_truth_bpm": 137.0,
        "ground_truth_key": "Am",
        "bpm": {"madmom": 136.36363636363706, "librosa": 135.99917763157896, "essentia": 136.6898193359375},
        "key": {"madmom": "Am", "librosa": "Fm", "essentia": "Am"},
    },
    {
        "file": "[08A - Am - 150.00] Michael McCann - Harvesters.mp3",
        "ground_truth_bpm": 150.0,
        "ground_truth_key": "Am",
        "bpm": {"madmom": 149.99999999999787, "librosa": 151.99908088235293, "essentia": 149.99240112304688},
        "key": {"madmom": "Am", "librosa": "Am", "essentia": "Am"},
    },
    {
        "file": "[08B - C - 085.00] Solar Fields - Electric Fluid.aiff",
        "ground_truth_bpm": 85.0,
        "ground_truth_key": "C",
        "bpm": {"madmom": 166.66666666666035, "librosa": 112.34714673913044, "essentia": 113.25591278076172},
        "key": {"madmom": "Cm", "librosa": "Cm", "essentia": "C"},
    },
    {
        "file": "[08B - C - 125] Tripswitch - Divine Falsehood.mp3",
        "ground_truth_bpm": 125.0,
        "ground_truth_key": "C",
        "bpm": {"madmom": 124.99999999999896, "librosa": 123.046875, "essentia": 125.02484893798828},
        "key": {"madmom": "C", "librosa": "F#m", "essentia": "C"},
    },
    {
        "file": "[09A - Em - 120.00] AES Dana - Undertow.aiff",
        "ground_truth_bpm": 120.0,
        "ground_truth_key": "Em",
        "bpm": {"madmom": 120.0, "librosa": 117.45383522727273, "essentia": 161.5841827392578},
        "key": {"madmom": "Em", "librosa": "Em", "essentia": "Em"},
    },
    {
        "file": "[09A - Em - 140.00] Tripswitch - Viscous (Eat Static's Jumbled Noise Remix).mp3",
        "ground_truth_bpm": 140.0,
        "ground_truth_key": "Em",
        "bpm": {"madmom": 139.534883720928, "librosa": 143.5546875, "essentia": 139.91188049316406},
        "key": {"madmom": "Em", "librosa": "Em", "essentia": "Em"},
    },
    {
        "file": "[09B - G - 123] Cristoph - Lost Witness.mp3",
        "ground_truth_bpm": 123.0,
        "ground_truth_key": "G",
        "bpm": {"madmom": 122.44897959183623, "librosa": 123.046875, "essentia": 122.9900894165039},
        "key": {"madmom": "Gm", "librosa": "Gm", "essentia": "Gm"},
    },
    {
        "file": "[09B - G - 130] Motionen - Ecstatic Dreamers.mp3",
        "ground_truth_bpm": 130.0,
        "ground_truth_key": "G",
        "bpm": {"madmom": 130.43478260869338, "librosa": 129.19921875, "essentia": 129.87709045410156},
        "key": {"madmom": "Cm", "librosa": "Em", "essentia": "Cm"},
    },
    {
        "file": "[10A - Bm - 160.00] Speedboys & DJ Phonk Soul - Manchmal trennen sich die Wege.aiff",
        "ground_truth_bpm": 160.0,
        "ground_truth_key": "Bm",
        "bpm": {"madmom": 157.89473684210716, "librosa": 80.74951171875, "essentia": 161.5670623779297},
        "key": {"madmom": "Em", "librosa": "Am", "essentia": "Em"},
    },
    {
        "file": "[10A - Bm - 180.00] Toxicspikeback - Snuck.aiff",
        "ground_truth_bpm": 180.0,
        "ground_truth_key": "Bm",
        "bpm": {"madmom": 181.81818181817493, "librosa": 89.10290948275862, "essentia": 178.20614624023438},
        "key": {"madmom": "Am", "librosa": "Cm", "essentia": "C"},
    },
    {
        "file": "[10B - D - 124.00] Ed Sheeran - Shivers (Dillon Francis Remix) [Club Mix].mp3",
        "ground_truth_bpm": 124.0,
        "ground_truth_key": "D",
        "bpm": {"madmom": 124.99999999999896, "librosa": 123.046875, "essentia": 123.83258819580078},
        "key": {"madmom": "D", "librosa": "F#m", "essentia": "D"},
    },
    {
        "file": "[10B - D - 125.00] Shiloh - Landmine Hopscotch (Cid Inc Remix).mp3",
        "ground_truth_bpm": 125.0,
        "ground_truth_key": "D",
        "bpm": {"madmom": 124.99999999999896, "librosa": 123.046875, "essentia": 125.00371551513672},
        "key": {"madmom": "Dm", "librosa": "F#m", "essentia": "Dm"},
    },
    {
        "file": "[11A - F#m - 126] D.Mongelos - To The Jungle.mp3",
        "ground_truth_bpm": 126.0,
        "ground_truth_key": "F#m",
        "bpm": {"madmom": 125.00000000000267, "librosa": 123.046875, "essentia": 125.96318817138672},
        "key": {"madmom": "F#m", "librosa": "F#m", "essentia": "F#m"},
    },
    {
        "file": "[11A - F#m - 140] Ozzy XPM - Left Behind (Will Atkinson Remix).mp3",
        "ground_truth_bpm": 140.0,
        "ground_truth_key": "F#m",
        "bpm": {"madmom": 139.534883720928, "librosa": 143.5546875, "essentia": 139.98008728027344},
        "key": {"madmom": "F#m", "librosa": "F#m", "essentia": "F#m"},
    },
    {
        "file": "[11B - A - 120] Pan-Pot - Sleepless (Stephan Bodzin Remix).mp3",
        "ground_truth_bpm": 120.0,
        "ground_truth_key": "A",
        "bpm": {"madmom": 120.0, "librosa": 95.703125, "essentia": 119.98466491699219},
        "key": {"madmom": "Am", "librosa": "Am", "essentia": "Am"},
    },
    {
        "file": "[11B - A - 147.00] Headspace - Astro Plane.mp3",
        "ground_truth_bpm": 147.0,
        "ground_truth_key": "A",
        "bpm": {"madmom": 146.34146341463537, "librosa": 143.5546875, "essentia": 146.94944763183594},
        "key": {"madmom": "Am", "librosa": "C#m", "essentia": "A"},
    },
    {
        "file": "[12A - C#m - 107.00] Shapers - Collapse (Silas Hoppe Remix).mp3",
        "ground_truth_bpm": 107.0,
        "ground_truth_key": "C#m",
        "bpm": {"madmom": 107.14285714285671, "librosa": 107.666015625, "essentia": 106.9860610961914},
        "key": {"madmom": "C#m", "librosa": "C#m", "essentia": "C#m"},
    },
    {
        "file": "[12A - C#m - 140] Neptune Project - Panspermia (The Digital Blonde Remix).aif",
        "ground_truth_bpm": 140.0,
        "ground_truth_key": "C#m",
        "bpm": {"madmom": 139.534883720928, "librosa": 143.5546875, "essentia": 139.89569091796875},
        "key": {"madmom": "C#m", "librosa": "C#m", "essentia": "C#m"},
    },
    {
        "file": "[12B - E - 122.00] Loscil - Sickbay.mp3",
        "ground_truth_bpm": 122.0,
        "ground_truth_key": "E",
        "bpm": {"madmom": 122.44897959183446, "librosa": 123.046875, "essentia": 122.03889465332031},
        "key": {"madmom": "C#m", "librosa": "C#m", "essentia": "E"},
    },
    {
        "file": "[12B - E - 155.00] Alexandra Stone - Mr. Saxobeat (Skearney Edit).aiff",
        "ground_truth_bpm": 155.0,
        "ground_truth_key": "E",
        "bpm": {"madmom": 153.8461538461536, "librosa": 151.99908088235293, "essentia": 154.6581573486328},
        "key": {"madmom": "C#m", "librosa": "Fm", "essentia": "C#m"},
    },
]

KNOWN_BPM_ALL_ANALYZER_FAILURES = {
    "[08B - C - 085.00] Solar Fields - Electric Fluid.aiff",
}

KNOWN_KEY_ALL_ANALYZER_FAILURES = {
    "[01B - B - 138] Underwater - Water Planet (Activa's Liquid Globe Remix).mp3",
    "[03B - Db - 137.00] Jones & Stephenson - The First Rebirth (John 00 Fleming Remix).mp3",
    "[04B - Ab - 140.00] Ayumi Hamasaki - Evolution (Goldenscan Club Mix).mp3",
    "[05B - Eb - 130] Tilt - Twelve.mp3",
    "[06A - Gm - 140.00] Altinbas - Biosfera.mp3",
    "[06B - Bb - 123] Stephan Bodzin - Singularity (Fur Coat Remix).mp3",
    "[06B - Bb - 140] Blade Attack - Seelenwandler (Junk Project Remix).mp3",
    "[07B - F - 126.00] Beyonce - Drunk in Love (Glass Half Empty Remix).aiff",
    "[07B - F - 135] I Hate Models - Those Shiny Razor Blades.mp3",
    "[09B - G - 123] Cristoph - Lost Witness.mp3",
    "[09B - G - 130] Motionen - Ecstatic Dreamers.mp3",
    "[10A - Bm - 160.00] Speedboys & DJ Phonk Soul - Manchmal trennen sich die Wege.aiff",
    "[10A - Bm - 180.00] Toxicspikeback - Snuck.aiff",
    "[10B - D - 125.00] Shiloh - Landmine Hopscotch (Cid Inc Remix).mp3",
    "[11B - A - 120] Pan-Pot - Sleepless (Stephan Bodzin Remix).mp3",
    "[12B - E - 155.00] Alexandra Stone - Mr. Saxobeat (Skearney Edit).aiff",
}


def _fixture_key_candidates(entry: dict[str, object]) -> dict[str, tuple[str, float]]:
    return {
        analyzer: (value, 1.0)
        for analyzer, value in entry["key"].items()
        if value is not None
    }


def _fixture_bpm_stats() -> dict[str, dict[str, float | int]]:
    analyzers = tuple(CALIBRATION_FIXTURE[0]["bpm"])
    stats: dict[str, dict[str, float | int]] = {}
    for analyzer in analyzers:
        errors = [
            abs(entry["bpm"][analyzer] - entry["ground_truth_bpm"])
            for entry in CALIBRATION_FIXTURE
        ]
        stats[analyzer] = {
            "mae": sum(errors) / len(errors),
            "within_1": sum(error <= 1.0 for error in errors),
            "within_2": sum(error <= 2.0 for error in errors),
        }
    return stats


def _fixture_key_stats() -> dict[str, int]:
    analyzers = tuple(CALIBRATION_FIXTURE[0]["key"])
    exact: dict[str, int] = {}
    for analyzer in analyzers:
        exact[analyzer] = sum(
            entry["key"][analyzer] == entry["ground_truth_key"]
            for entry in CALIBRATION_FIXTURE
        )
    return exact


def test_fuse_bpm_prefers_highest_priority_value_within_agreeing_cluster():
    bpm, confidence = fuse_bpm(
        {"madmom": 125.0, "essentia": 125.99, "librosa": 130.5}
    )
    assert bpm == 125.99
    assert confidence == pytest.approx(2 / 3)


@pytest.mark.parametrize(
    ("candidates", "expected_bpm"),
    [
        ({"essentia": 126.1, "madmom": 131.0, "librosa": 135.0}, 126.1),
        ({"madmom": 131.0, "librosa": 135.0}, 131.0),
        ({"librosa": 135.0}, 135.0),
    ],
)
def test_fuse_bpm_falls_back_to_best_available_calibrated_analyzer(
    candidates: dict[str, float], expected_bpm: float
):
    bpm, confidence = fuse_bpm(candidates)
    assert bpm == expected_bpm
    assert confidence == 0.0


def test_fuse_bpm_preserves_tempo_octaves_and_ignores_half_time_outlier():
    bpm, confidence = fuse_bpm(
        {"madmom": 64.0, "essentia": 128.0, "librosa": 129.0}
    )
    assert bpm_values_octave_related(64.0, 128.0)
    assert bpm == 128.0
    assert confidence == pytest.approx(2 / 3)


def test_fuse_bpm_returns_none_for_empty_candidates():
    bpm, confidence = fuse_bpm({})
    assert bpm is None
    assert confidence == 0.0


def test_bpm_priority_matches_48_track_calibration():
    stats = _fixture_bpm_stats()
    assert (
        tuple(sorted(stats, key=lambda analyzer: stats[analyzer]["mae"]))
        == BPM_ANALYZER_PRIORITY
    )
    assert stats["essentia"]["mae"] == pytest.approx(1.6633934974670408)
    assert stats["madmom"]["mae"] == pytest.approx(4.059749778826172)
    assert stats["librosa"]["mae"] == pytest.approx(8.228313527635363)
    assert stats["essentia"]["within_2"] == 46
    assert stats["madmom"]["within_2"] == 45
    assert stats["librosa"]["within_2"] == 22


def test_fuse_bpm_matches_48_track_calibration_fixture():
    errors: list[float] = []
    within_1 = 0
    within_2 = 0
    all_analyzer_failures: set[str] = set()

    for entry in CALIBRATION_FIXTURE:
        bpm, _confidence = fuse_bpm(entry["bpm"])
        assert bpm is not None

        error = abs(bpm - entry["ground_truth_bpm"])
        errors.append(error)
        within_1 += error <= 1.0
        within_2 += error <= 2.0

        if all(
            abs(_normalize_bpm(candidate) - entry["ground_truth_bpm"]) > 2.0
            for candidate in entry["bpm"].values()
        ):
            all_analyzer_failures.add(entry["file"])

    assert sum(errors) / len(errors) == pytest.approx(0.7970563570658363)
    assert within_1 == 44
    assert within_2 == 47
    assert all_analyzer_failures == KNOWN_BPM_ALL_ANALYZER_FAILURES


def test_fuse_key_prefers_agreement_over_confidence_weighting():
    key, confidence = fuse_key(
        {
            "madmom": ("Dm", 0.9),
            "librosa": ("C#m", 0.1),
            "essentia": ("C#m", 0.8),
        }
    )
    assert key == "C#m"
    assert confidence == pytest.approx(2 / 3)


def test_fuse_key_breaks_agreement_ties_by_highest_priority_supporter():
    key, confidence = fuse_key(
        {
            "madmom": ("F#m", 0.9),
            "librosa": ("C#m", 0.7),
            "essentia": ("F#m", 0.8),
            "custom": ("C#m", 0.6),
        }
    )
    assert key == "F#m"
    assert confidence == 0.5


@pytest.mark.parametrize(
    ("candidates", "expected_key"),
    [
        (
            {
                "essentia": ("F#m", 0.8),
                "librosa": ("Em", 0.5),
                "madmom": ("Dm", 0.9),
            },
            "F#m",
        ),
        (
            {
                "librosa": ("Em", 0.5),
                "madmom": ("Dm", 0.9),
            },
            "Dm",
        ),
    ],
)
def test_fuse_key_falls_back_to_best_available_calibrated_analyzer(
    candidates: dict[str, tuple[str, float]], expected_key: str
):
    key, confidence = fuse_key(candidates)
    assert key == expected_key
    assert confidence == 0.0


def test_fuse_key_returns_none_for_empty_candidates():
    key, confidence = fuse_key({})
    assert key is None
    assert confidence == 0.0


def test_fuse_key_keeps_best_analyzer_when_only_lower_priority_votes_agree():
    key, confidence = fuse_key(
        {
            "madmom": ("G# minor", 0.85),
            "librosa": ("G#m", 0.7),
            "essentia": ("G#", 0.8),
        }
    )
    assert _canonicalize_key("G# minor") == "Abm"
    assert key == "Ab"
    assert confidence == 0.0


def test_key_priority_matches_48_track_calibration():
    exact = _fixture_key_stats()
    assert (
        tuple(sorted(exact, key=lambda analyzer: exact[analyzer], reverse=True))
        == KEY_ANALYZER_PRIORITY
    )
    assert exact == {"madmom": 26, "librosa": 17, "essentia": 31}


def test_fuse_key_matches_48_track_calibration_fixture_without_regressing_best_analyzer():
    best_single_analyzer_exact = _fixture_key_stats()["essentia"]
    fused_exact = 0
    all_analyzer_failures: set[str] = set()

    for entry in CALIBRATION_FIXTURE:
        key, _confidence = fuse_key(_fixture_key_candidates(entry))
        if key == entry["ground_truth_key"]:
            fused_exact += 1

        if all(
            candidate != entry["ground_truth_key"]
            for candidate in entry["key"].values()
            if candidate is not None
        ):
            all_analyzer_failures.add(entry["file"])

    assert best_single_analyzer_exact == 31
    assert fused_exact == 31
    assert fused_exact >= best_single_analyzer_exact
    assert all_analyzer_failures == KNOWN_KEY_ALL_ANALYZER_FAILURES
