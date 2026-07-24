-- Xeremia application schema (PostgreSQL).
-- Generated from the production music_collection database; excludes legacy tables
-- (attribute, track_attribute, set_tracklist_version/slot/candidate, track_marked_for_deletion).
-- Apply via: python -m src.scripts.init_db

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SEQUENCE IF NOT EXISTS public.artist_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.artist_track_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.track_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.initial_tags_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.post_mik_tags_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.post_rekordbox_tags_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.final_tags_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.artist (
    id integer NOT NULL,
    name character varying NOT NULL,
    track_count integer NOT NULL
);


--
-- Name: artist_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.artist_mapping (
    id integer NOT NULL,
    raw_artist character varying(255) NOT NULL,
    canonical_artist character varying(255) NOT NULL,
    match_type character varying(32) NOT NULL
);


--
-- Name: artist_mapping_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.artist_mapping_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: artist_mapping_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.artist_mapping_id_seq OWNED BY public.artist_mapping.id;


--
-- Name: artist_track; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.artist_track (
    id integer NOT NULL,
    artist_id integer NOT NULL,
    track_id integer NOT NULL
);


--
-- Name: dj_set; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.dj_set (
    id integer NOT NULL,
    name character varying(256) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: dj_set_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.dj_set_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dj_set_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dj_set_id_seq OWNED BY public.dj_set.id;


--
-- Name: final_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.final_tags (
    id integer NOT NULL,
    track_id integer NOT NULL,
    title character varying,
    key character varying,
    energy integer,
    bpm numeric(5,2)
);


--
-- Name: genre_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.genre_mapping (
    id integer NOT NULL,
    raw_genre character varying(255) NOT NULL,
    canonical_genre character varying(255) NOT NULL
);


--
-- Name: genre_mapping_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.genre_mapping_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: genre_mapping_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.genre_mapping_id_seq OWNED BY public.genre_mapping.id;


--
-- Name: initial_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.initial_tags (
    id integer NOT NULL,
    track_id integer NOT NULL,
    title character varying,
    key character varying,
    bpm numeric(5,2)
);


--
-- Name: label_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.label_mapping (
    id integer NOT NULL,
    raw_label character varying(255) NOT NULL,
    canonical_label character varying(255) NOT NULL,
    match_type character varying(32) NOT NULL,
    exclude_pattern character varying(255)
);


--
-- Name: label_mapping_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.label_mapping_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: label_mapping_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.label_mapping_id_seq OWNED BY public.label_mapping.id;


--
-- Name: post_mik_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.post_mik_tags (
    id integer NOT NULL,
    track_id integer NOT NULL,
    title character varying,
    key character varying,
    energy integer,
    bpm numeric(5,2)
);


--
-- Name: post_rekordbox_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.post_rekordbox_tags (
    id integer NOT NULL,
    track_id integer NOT NULL,
    title character varying,
    key character varying,
    energy integer,
    bpm numeric(5,2)
);


--
-- Name: scoring_weight_override; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.scoring_weight_override (
    id integer NOT NULL,
    scope character varying(32) NOT NULL,
    weights_json text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: table_preference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.table_preference (
    device_hash character varying(64) DEFAULT '__global__'::character varying NOT NULL,
    table_id character varying(32) NOT NULL,
    column_order jsonb NOT NULL,
    column_visibility jsonb NOT NULL,
    column_widths jsonb NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: scoring_weight_override_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.scoring_weight_override_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scoring_weight_override_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scoring_weight_override_id_seq OWNED BY public.scoring_weight_override.id;


--
-- Name: set_explorer_edge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.set_explorer_edge (
    id integer NOT NULL,
    set_id integer NOT NULL,
    parent_node_id character varying(64) NOT NULL,
    child_node_id character varying(64) NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: set_explorer_edge_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.set_explorer_edge_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: set_explorer_edge_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.set_explorer_edge_id_seq OWNED BY public.set_explorer_edge.id;


--
-- Name: set_explorer_node; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.set_explorer_node (
    id integer NOT NULL,
    set_id integer NOT NULL,
    node_id character varying(64) NOT NULL,
    track_id integer NOT NULL,
    level integer DEFAULT 0 NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL,
    col_index integer DEFAULT 0 NOT NULL
);


--
-- Name: set_explorer_node_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.set_explorer_node_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: set_explorer_node_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.set_explorer_node_id_seq OWNED BY public.set_explorer_node.id;


--
-- Name: set_pool_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.set_pool_entry (
    id integer NOT NULL,
    set_id integer NOT NULL,
    track_id integer NOT NULL,
    insertion_order integer DEFAULT 0 NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: set_pool_entry_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.set_pool_entry_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: set_pool_entry_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.set_pool_entry_id_seq OWNED BY public.set_pool_entry.id;


--
-- Name: set_pool_subgroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.set_pool_subgroup (
    id integer NOT NULL,
    set_id integer NOT NULL,
    name character varying(256) NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: set_pool_subgroup_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.set_pool_subgroup_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: set_pool_subgroup_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.set_pool_subgroup_id_seq OWNED BY public.set_pool_subgroup.id;


--
-- Name: set_pool_subgroup_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.set_pool_subgroup_member (
    id integer NOT NULL,
    subgroup_id integer NOT NULL,
    pool_entry_id integer NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: set_pool_subgroup_member_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.set_pool_subgroup_member_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: set_pool_subgroup_member_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.set_pool_subgroup_member_id_seq OWNED BY public.set_pool_subgroup_member.id;


--
-- Name: set_tracklist_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.set_tracklist_entry (
    id integer NOT NULL,
    set_id integer NOT NULL,
    track_id integer NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    added_at timestamp without time zone DEFAULT now() NOT NULL,
    note text DEFAULT ''::text NOT NULL
);


--
-- Name: set_tracklist_entry_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.set_tracklist_entry_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: set_tracklist_entry_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.set_tracklist_entry_id_seq OWNED BY public.set_tracklist_entry.id;


--
-- Name: track; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.track (
    id integer NOT NULL,
    file_name character varying NOT NULL,
    title character varying NOT NULL,
    bpm numeric(5,2),
    key character varying,
    camelot_code character varying,
    energy integer,
    genre character varying,
    label character varying,
    date_added character varying,
    comment character varying
);


--
-- Name: track_cosine_similarity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.track_cosine_similarity (
    id1 integer NOT NULL,
    id2 integer NOT NULL,
    cosine_similarity double precision NOT NULL,
    descriptor_version character varying(32) NOT NULL,
    computed_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_track_cosine_similarity_id_order CHECK ((id1 < id2))
);


--
-- Name: track_descriptor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.track_descriptor (
    id integer NOT NULL,
    track_id integer NOT NULL,
    global_vector bytea NOT NULL,
    intro_vector bytea,
    outro_vector bytea,
    descriptor_version character varying(32) NOT NULL,
    computed_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: track_descriptor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.track_descriptor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: track_descriptor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.track_descriptor_id_seq OWNED BY public.track_descriptor.id;


--
-- Name: track_trait; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.track_trait (
    id integer NOT NULL,
    track_id integer NOT NULL,
    voice_instrumental double precision,
    danceability double precision,
    bright_dark double precision,
    acoustic_electronic double precision,
    tonal_atonal double precision,
    reverb double precision,
    onset_density double precision,
    spectral_flatness double precision,
    mood_theme jsonb,
    genre jsonb,
    instruments jsonb,
    audio_events jsonb,
    vocal_energy_ratio double precision,
    trait_version character varying(32) NOT NULL,
    computed_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: track_trait_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.track_trait_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: track_trait_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.track_trait_id_seq OWNED BY public.track_trait.id;


--
-- Name: artist_mapping id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_mapping ALTER COLUMN id SET DEFAULT nextval('public.artist_mapping_id_seq'::regclass);


--
-- Name: dj_set id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dj_set ALTER COLUMN id SET DEFAULT nextval('public.dj_set_id_seq'::regclass);


--
-- Name: genre_mapping id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.genre_mapping ALTER COLUMN id SET DEFAULT nextval('public.genre_mapping_id_seq'::regclass);


--
-- Name: label_mapping id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.label_mapping ALTER COLUMN id SET DEFAULT nextval('public.label_mapping_id_seq'::regclass);


--
-- Name: scoring_weight_override id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_weight_override ALTER COLUMN id SET DEFAULT nextval('public.scoring_weight_override_id_seq'::regclass);


--
-- Name: set_explorer_edge id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_explorer_edge ALTER COLUMN id SET DEFAULT nextval('public.set_explorer_edge_id_seq'::regclass);


--
-- Name: set_explorer_node id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_explorer_node ALTER COLUMN id SET DEFAULT nextval('public.set_explorer_node_id_seq'::regclass);


--
-- Name: set_pool_entry id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_entry ALTER COLUMN id SET DEFAULT nextval('public.set_pool_entry_id_seq'::regclass);


--
-- Name: set_pool_subgroup id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_subgroup ALTER COLUMN id SET DEFAULT nextval('public.set_pool_subgroup_id_seq'::regclass);


--
-- Name: set_pool_subgroup_member id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_subgroup_member ALTER COLUMN id SET DEFAULT nextval('public.set_pool_subgroup_member_id_seq'::regclass);


--
-- Name: set_tracklist_entry id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_tracklist_entry ALTER COLUMN id SET DEFAULT nextval('public.set_tracklist_entry_id_seq'::regclass);


--
-- Name: track_descriptor id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_descriptor ALTER COLUMN id SET DEFAULT nextval('public.track_descriptor_id_seq'::regclass);


--
-- Name: track_trait id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_trait ALTER COLUMN id SET DEFAULT nextval('public.track_trait_id_seq'::regclass);


--
-- Name: artist_mapping artist_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_mapping
    ADD CONSTRAINT artist_mapping_pkey PRIMARY KEY (id);


--
-- Name: artist_mapping artist_mapping_raw_artist_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_mapping
    ADD CONSTRAINT artist_mapping_raw_artist_key UNIQUE (raw_artist);


--
-- Name: artist artist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist
    ADD CONSTRAINT artist_pkey PRIMARY KEY (id, name);


--
-- Name: artist_track artist_track_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_track
    ADD CONSTRAINT artist_track_pkey PRIMARY KEY (id, artist_id, track_id);


--
-- Name: dj_set dj_set_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dj_set
    ADD CONSTRAINT dj_set_pkey PRIMARY KEY (id);


--
-- Name: final_tags final_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_tags
    ADD CONSTRAINT final_tags_pkey PRIMARY KEY (id, track_id);


--
-- Name: genre_mapping genre_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.genre_mapping
    ADD CONSTRAINT genre_mapping_pkey PRIMARY KEY (id);


--
-- Name: genre_mapping genre_mapping_raw_genre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.genre_mapping
    ADD CONSTRAINT genre_mapping_raw_genre_key UNIQUE (raw_genre);


--
-- Name: initial_tags initial_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_tags
    ADD CONSTRAINT initial_tags_pkey PRIMARY KEY (id, track_id);


--
-- Name: label_mapping label_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.label_mapping
    ADD CONSTRAINT label_mapping_pkey PRIMARY KEY (id);


--
-- Name: label_mapping label_mapping_raw_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.label_mapping
    ADD CONSTRAINT label_mapping_raw_label_key UNIQUE (raw_label);


--
-- Name: post_mik_tags post_mik_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_mik_tags
    ADD CONSTRAINT post_mik_tags_pkey PRIMARY KEY (id, track_id);


--
-- Name: post_rekordbox_tags post_rekordbox_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_rekordbox_tags
    ADD CONSTRAINT post_rekordbox_tags_pkey PRIMARY KEY (id, track_id);


--
-- Name: scoring_weight_override scoring_weight_override_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_weight_override
    ADD CONSTRAINT scoring_weight_override_pkey PRIMARY KEY (id);


--
-- Name: scoring_weight_override scoring_weight_override_scope_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scoring_weight_override
    ADD CONSTRAINT scoring_weight_override_scope_key UNIQUE (scope);


--
-- Name: table_preference table_preference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_preference
    ADD CONSTRAINT table_preference_pkey PRIMARY KEY (device_hash, table_id);


--
-- Name: set_explorer_edge set_explorer_edge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_explorer_edge
    ADD CONSTRAINT set_explorer_edge_pkey PRIMARY KEY (id);


--
-- Name: set_explorer_edge set_explorer_edge_set_id_parent_node_id_child_node_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_explorer_edge
    ADD CONSTRAINT set_explorer_edge_set_id_parent_node_id_child_node_id_key UNIQUE (set_id, parent_node_id, child_node_id);


--
-- Name: set_explorer_node set_explorer_node_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_explorer_node
    ADD CONSTRAINT set_explorer_node_pkey PRIMARY KEY (id);


--
-- Name: set_explorer_node set_explorer_node_set_id_node_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_explorer_node
    ADD CONSTRAINT set_explorer_node_set_id_node_id_key UNIQUE (set_id, node_id);


--
-- Name: set_pool_entry set_pool_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_entry
    ADD CONSTRAINT set_pool_entry_pkey PRIMARY KEY (id);


--
-- Name: set_pool_entry set_pool_entry_set_id_track_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_entry
    ADD CONSTRAINT set_pool_entry_set_id_track_id_key UNIQUE (set_id, track_id);


--
-- Name: set_pool_subgroup set_pool_subgroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_subgroup
    ADD CONSTRAINT set_pool_subgroup_pkey PRIMARY KEY (id);


--
-- Name: set_pool_subgroup_member set_pool_subgroup_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_subgroup_member
    ADD CONSTRAINT set_pool_subgroup_member_pkey PRIMARY KEY (id);


--
-- Name: set_pool_subgroup_member uq_subgroup_member; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_subgroup_member
    ADD CONSTRAINT uq_subgroup_member UNIQUE (subgroup_id, pool_entry_id);


--
-- Name: set_tracklist_entry set_tracklist_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_tracklist_entry
    ADD CONSTRAINT set_tracklist_entry_pkey PRIMARY KEY (id);


--
-- Name: set_tracklist_entry set_tracklist_entry_set_id_track_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_tracklist_entry
    ADD CONSTRAINT set_tracklist_entry_set_id_track_id_key UNIQUE (set_id, track_id);


--
-- Name: track_cosine_similarity track_cosine_similarity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_cosine_similarity
    ADD CONSTRAINT track_cosine_similarity_pkey PRIMARY KEY (id1, id2);


--
-- Name: track_descriptor track_descriptor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_descriptor
    ADD CONSTRAINT track_descriptor_pkey PRIMARY KEY (id);


--
-- Name: track_descriptor track_descriptor_track_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_descriptor
    ADD CONSTRAINT track_descriptor_track_id_key UNIQUE (track_id);


--
-- Name: track track_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track
    ADD CONSTRAINT track_pkey PRIMARY KEY (id, file_name);


--
-- Name: track_trait track_trait_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_trait
    ADD CONSTRAINT track_trait_pkey PRIMARY KEY (id);


--
-- Name: track_trait track_trait_track_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_trait
    ADD CONSTRAINT track_trait_track_id_key UNIQUE (track_id);


--
-- Name: artist_mapping_raw_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS artist_mapping_raw_idx ON public.artist_mapping USING btree (raw_artist);


--
-- Name: genre_mapping_raw_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS genre_mapping_raw_idx ON public.genre_mapping USING btree (raw_genre);


--
-- Name: idx_explorer_edge_set_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_explorer_edge_set_id ON public.set_explorer_edge USING btree (set_id);


--
-- Name: idx_explorer_node_set_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_explorer_node_set_id ON public.set_explorer_node USING btree (set_id);


--
-- Name: idx_pool_set_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_pool_set_id ON public.set_pool_entry USING btree (set_id);


--
-- Name: idx_pool_track_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_pool_track_id ON public.set_pool_entry USING btree (track_id);


--
-- Name: idx_subgroup_member_pool_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_subgroup_member_pool_entry_id ON public.set_pool_subgroup_member USING btree (pool_entry_id);


--
-- Name: idx_subgroup_member_subgroup_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_subgroup_member_subgroup_id ON public.set_pool_subgroup_member USING btree (subgroup_id);


--
-- Name: idx_subgroup_set_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_subgroup_set_id ON public.set_pool_subgroup USING btree (set_id);


--
-- Name: idx_tracklist_set_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_tracklist_set_id ON public.set_tracklist_entry USING btree (set_id);


--
-- Name: idx_tracklist_track_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_tracklist_track_id ON public.set_tracklist_entry USING btree (track_id);


--
-- Name: ix_artist_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS ix_artist_id ON public.artist USING btree (id);


--
-- Name: ix_artist_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS ix_artist_name ON public.artist USING btree (name);


--
-- Name: ix_artist_track_artist_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_artist_track_artist_id ON public.artist_track USING btree (artist_id);


--
-- Name: ix_artist_track_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS ix_artist_track_id ON public.artist_track USING btree (id);


--
-- Name: ix_artist_track_track_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_artist_track_track_id ON public.artist_track USING btree (track_id);


--
-- Name: ix_final_tags_bpm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_final_tags_bpm ON public.final_tags USING btree (bpm);


--
-- Name: ix_final_tags_energy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_final_tags_energy ON public.final_tags USING btree (energy);


--
-- Name: ix_final_tags_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS ix_final_tags_id ON public.final_tags USING btree (id);


--
-- Name: ix_final_tags_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_final_tags_key ON public.final_tags USING btree (key);


--
-- Name: ix_final_tags_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_final_tags_title ON public.final_tags USING btree (title);


--
-- Name: ix_final_tags_track_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS ix_final_tags_track_id ON public.final_tags USING btree (track_id);


--
-- Name: ix_initial_tags_bpm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_initial_tags_bpm ON public.initial_tags USING btree (bpm);


--
-- Name: ix_initial_tags_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS ix_initial_tags_id ON public.initial_tags USING btree (id);


--
-- Name: ix_initial_tags_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_initial_tags_key ON public.initial_tags USING btree (key);


--
-- Name: ix_initial_tags_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_initial_tags_title ON public.initial_tags USING btree (title);


--
-- Name: ix_initial_tags_track_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS ix_initial_tags_track_id ON public.initial_tags USING btree (track_id);


--
-- Name: ix_post_mik_tags_bpm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_post_mik_tags_bpm ON public.post_mik_tags USING btree (bpm);


--
-- Name: ix_post_mik_tags_energy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_post_mik_tags_energy ON public.post_mik_tags USING btree (energy);


--
-- Name: ix_post_mik_tags_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS ix_post_mik_tags_id ON public.post_mik_tags USING btree (id);


--
-- Name: ix_post_mik_tags_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_post_mik_tags_key ON public.post_mik_tags USING btree (key);


--
-- Name: ix_post_mik_tags_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_post_mik_tags_title ON public.post_mik_tags USING btree (title);


--
-- Name: ix_post_mik_tags_track_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS ix_post_mik_tags_track_id ON public.post_mik_tags USING btree (track_id);


--
-- Name: ix_post_rekordbox_tags_bpm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_post_rekordbox_tags_bpm ON public.post_rekordbox_tags USING btree (bpm);


--
-- Name: ix_post_rekordbox_tags_energy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_post_rekordbox_tags_energy ON public.post_rekordbox_tags USING btree (energy);


--
-- Name: ix_post_rekordbox_tags_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS ix_post_rekordbox_tags_id ON public.post_rekordbox_tags USING btree (id);


--
-- Name: ix_post_rekordbox_tags_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_post_rekordbox_tags_key ON public.post_rekordbox_tags USING btree (key);


--
-- Name: ix_post_rekordbox_tags_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_post_rekordbox_tags_title ON public.post_rekordbox_tags USING btree (title);


--
-- Name: ix_post_rekordbox_tags_track_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS ix_post_rekordbox_tags_track_id ON public.post_rekordbox_tags USING btree (track_id);


--
-- Name: ix_track_bpm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_track_bpm ON public.track USING btree (bpm);


--
-- Name: ix_track_camelot_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_track_camelot_code ON public.track USING btree (camelot_code);


--
-- Name: ix_track_date_added; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_track_date_added ON public.track USING btree (date_added);


--
-- Name: ix_track_energy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_track_energy ON public.track USING btree (energy);


--
-- Name: ix_track_file_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_track_file_path ON public.track USING btree (file_name);


--
-- Name: ix_track_genre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_track_genre ON public.track USING btree (genre);


--
-- Name: ix_track_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS ix_track_id ON public.track USING btree (id);


--
-- Name: ix_track_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_track_key ON public.track USING btree (key);


--
-- Name: ix_track_label; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_track_label ON public.track USING btree (label);


--
-- Name: ix_track_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS ix_track_title ON public.track USING btree (title);


--
-- Name: label_mapping_raw_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS label_mapping_raw_idx ON public.label_mapping USING btree (raw_label);


--
-- Name: track_cosine_similarity_id1_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS track_cosine_similarity_id1_idx ON public.track_cosine_similarity USING btree (id1);


--
-- Name: track_cosine_similarity_id2_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS track_cosine_similarity_id2_idx ON public.track_cosine_similarity USING btree (id2);


--
-- Name: track_descriptor_track_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS track_descriptor_track_id_idx ON public.track_descriptor USING btree (track_id);


--
-- Name: track_title_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS track_title_trgm_idx ON public.track USING gin (title public.gin_trgm_ops);


--
-- Name: track_trait_track_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS track_trait_track_id_idx ON public.track_trait USING btree (track_id);


--
-- Name: artist_track artist_track_artist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_track
    ADD CONSTRAINT artist_track_artist_id_fkey FOREIGN KEY (artist_id) REFERENCES public.artist(id);


--
-- Name: artist_track artist_track_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artist_track
    ADD CONSTRAINT artist_track_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(id);


--
-- Name: final_tags final_tags_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_tags
    ADD CONSTRAINT final_tags_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(id);


--
-- Name: initial_tags initial_tags_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.initial_tags
    ADD CONSTRAINT initial_tags_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(id);


--
-- Name: post_mik_tags post_mik_tags_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_mik_tags
    ADD CONSTRAINT post_mik_tags_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(id);


--
-- Name: post_rekordbox_tags post_rekordbox_tags_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_rekordbox_tags
    ADD CONSTRAINT post_rekordbox_tags_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(id);


--
-- Name: set_explorer_edge set_explorer_edge_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_explorer_edge
    ADD CONSTRAINT set_explorer_edge_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.dj_set(id) ON DELETE CASCADE;


--
-- Name: set_explorer_node set_explorer_node_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_explorer_node
    ADD CONSTRAINT set_explorer_node_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.dj_set(id) ON DELETE CASCADE;


--
-- Name: set_explorer_node set_explorer_node_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_explorer_node
    ADD CONSTRAINT set_explorer_node_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(id) ON DELETE CASCADE;


--
-- Name: set_pool_entry set_pool_entry_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_entry
    ADD CONSTRAINT set_pool_entry_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.dj_set(id) ON DELETE CASCADE;


--
-- Name: set_pool_entry set_pool_entry_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_entry
    ADD CONSTRAINT set_pool_entry_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(id) ON DELETE CASCADE;


--
-- Name: set_pool_subgroup set_pool_subgroup_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_subgroup
    ADD CONSTRAINT set_pool_subgroup_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.dj_set(id) ON DELETE CASCADE;


--
-- Name: set_pool_subgroup_member set_pool_subgroup_member_pool_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_subgroup_member
    ADD CONSTRAINT set_pool_subgroup_member_pool_entry_id_fkey FOREIGN KEY (pool_entry_id) REFERENCES public.set_pool_entry(id) ON DELETE CASCADE;


--
-- Name: set_pool_subgroup_member set_pool_subgroup_member_subgroup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_pool_subgroup_member
    ADD CONSTRAINT set_pool_subgroup_member_subgroup_id_fkey FOREIGN KEY (subgroup_id) REFERENCES public.set_pool_subgroup(id) ON DELETE CASCADE;


--
-- Name: set_tracklist_entry set_tracklist_entry_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_tracklist_entry
    ADD CONSTRAINT set_tracklist_entry_set_id_fkey FOREIGN KEY (set_id) REFERENCES public.dj_set(id) ON DELETE CASCADE;


--
-- Name: set_tracklist_entry set_tracklist_entry_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.set_tracklist_entry
    ADD CONSTRAINT set_tracklist_entry_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(id) ON DELETE CASCADE;


--
-- Name: track_cosine_similarity track_cosine_similarity_id1_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_cosine_similarity
    ADD CONSTRAINT track_cosine_similarity_id1_fkey FOREIGN KEY (id1) REFERENCES public.track(id);


--
-- Name: track_cosine_similarity track_cosine_similarity_id2_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_cosine_similarity
    ADD CONSTRAINT track_cosine_similarity_id2_fkey FOREIGN KEY (id2) REFERENCES public.track(id);


--
-- Name: track_descriptor track_descriptor_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_descriptor
    ADD CONSTRAINT track_descriptor_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(id);


--
-- Name: track_trait track_trait_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_trait
    ADD CONSTRAINT track_trait_track_id_fkey FOREIGN KEY (track_id) REFERENCES public.track(id);


--
-- PostgreSQL database dump complete
--

