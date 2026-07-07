from pathlib import Path

from setuptools import find_packages, setup


requirements_path = Path(__file__).with_name("requirements.txt")
requirements = [
    requirement.strip()
    for requirement in requirements_path.read_text(encoding="utf-8").splitlines()
]

setup(
    name="xeremia",
    version="2.4.4",
    description="Tools for DJs: generate informative file/track titles (Camelot code, key, BPM) using ID3 metadata; "
    "display candidate transition matches using playing track Camelot code and BPM.",
    url="https://github.com/alenlukic/xeremia",
    author="Alen Lukic",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "License :: OSI Approved :: GNU General Public License v3 or later (GPLv3+)",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    keywords="dj harmonic mixing camelot code audio id3 beatport",
    install_requires=requirements,
    packages=find_packages(exclude=["tests", "tests.*"]),
    python_requires=">=3.9,<3.12",
)
