-- Canonical mapping seed data for artist/genre/label normalization.
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING).

INSERT INTO genre_mapping (raw_genre, canonical_genre) VALUES
    ('Psy-Trance', 'Psytrance')
ON CONFLICT (raw_genre) DO NOTHING;

INSERT INTO label_mapping (raw_label, canonical_label, match_type, exclude_pattern) VALUES
    ('joof',         'JOOF',               'word', NULL),
    ('shinemusic',   'Shine Music',        'word', NULL),
    ('vii',          'VII',                'word', NULL),
    ('rfr',          'RFR',                'word', NULL),
    ('cdr',          'CDR',                'word', NULL),
    ('knm',          'KNM',                'word', NULL),
    ('umc',          'UMC',                'word', NULL),
    ('uv',           'UV',                 'word', NULL),
    ('nx1',          'NX1',                'word', NULL),
    ('srx',          'SRX',                'word', NULL),
    ('kgg',          'KGG',                'word', NULL),
    ('dpe',          'DPE',                'word', NULL),
    ('kmx',          'KMX',                'word', NULL),
    ('dbx',          'DBX',                'word', NULL),
    ('x7m',          'X7M',                'word', NULL),
    ('cr2',          'CR2',                'word', NULL),
    ('dfc',          'DFC',                'word', NULL),
    ('kd',           'KD',                 'word', NULL),
    ('tk',           'TK',                 'word', NULL),
    ('uk',           'UK',                 'word', NULL),
    ('l.i.e.s.',     'L.I.E.S.',           'word', NULL),
    ('n.a.m.e',      'N.A.M.E',            'word', NULL),
    ('d.o.c.',       'D.O.C.',             'word', NULL),
    ('(Armada)',       '',                 'strip_suffix', NULL),
    ('(Armada Music)', '',                 'strip_suffix', NULL),
    ('(Spinnin)',      '',                 'strip_suffix', NULL),
    ('hommega',      'HOMmega Productions',   'substring', NULL),
    ('pure trance',  'Pure Trance Recordings','substring', 'pure trance progressive')
ON CONFLICT (raw_label) DO NOTHING;

INSERT INTO artist_mapping (raw_artist, canonical_artist, match_type) VALUES
    ('Tiësto',    'Tiesto', 'exact'),
    ('DJ Tiësto', 'Tiesto', 'exact'),
    ('DJ Tiesto', 'Tiesto', 'exact'),
    ('Kamaya Painters', 'Kamaya Painters', 'contains')
ON CONFLICT (raw_artist) DO NOTHING;
