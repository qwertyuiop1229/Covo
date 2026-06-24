-- Cloudflare D1 Schema for Covo (Firestore Migration)

-- 1. Users & Profiles
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    nickname TEXT,
    avatar_url TEXT,
    public_key_jwk TEXT, -- Stored as JSON string
    fcm_tokens TEXT, -- Stored as JSON array
    created_at INTEGER, -- Unix timestamp in milliseconds
    updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_app_id ON users(app_id);

-- 2. User Private Keys
CREATE TABLE IF NOT EXISTS user_private_keys (
    user_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    key_type TEXT NOT NULL, -- 'keys' or 'escrowKey'
    key_data TEXT NOT NULL, -- Stored as JSON string
    updated_at INTEGER,
    PRIMARY KEY (user_id, app_id, key_type)
);

-- 3. User Read States (Per user, per room read states)
CREATE TABLE IF NOT EXISTS user_read_states (
    user_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    last_read_at INTEGER, -- Unix timestamp in milliseconds
    PRIMARY KEY (user_id, app_id, room_id)
);

-- 4. Settings (App global settings like allowedEmails, adminList, etc.)
CREATE TABLE IF NOT EXISTS settings (
    app_id TEXT NOT NULL,
    setting_id TEXT NOT NULL, -- 'allowedEmails', 'adminList', 'listAdminList', 'escrowKey'
    setting_data TEXT NOT NULL, -- Stored as JSON string
    updated_at INTEGER,
    PRIMARY KEY (app_id, setting_id)
);

-- 5. Servers
CREATE TABLE IF NOT EXISTS servers (
    server_id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_public INTEGER DEFAULT 0, -- boolean: 0 or 1
    created_by TEXT NOT NULL,
    created_at INTEGER,
    member_count INTEGER DEFAULT 1,
    server_data TEXT -- Store any additional fields as JSON
);
CREATE INDEX IF NOT EXISTS idx_servers_app_id_public ON servers(app_id, is_public);

-- 6. Server Joined Users (For querying which servers a user has joined)
CREATE TABLE IF NOT EXISTS server_joined_users (
    server_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    joined_at INTEGER,
    PRIMARY KEY (server_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_server_joined_users_user_id ON server_joined_users(user_id, app_id);

-- 7. Server Secrets (For auth / passwordHash)
CREATE TABLE IF NOT EXISTS server_secrets (
    server_id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    updated_at INTEGER
);

-- 8. Server Profiles (Per-server user profiles)
CREATE TABLE IF NOT EXISTS server_profiles (
    server_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    profile_data TEXT NOT NULL, -- Stored as JSON string
    updated_at INTEGER,
    PRIMARY KEY (server_id, user_id)
);

-- 9. Server Invite Codes & Index
CREATE TABLE IF NOT EXISTS server_invite_codes (
    code TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER,
    expires_at INTEGER,
    uses INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 0,
    disabled INTEGER DEFAULT 0, -- boolean: 0 or 1
    invite_data TEXT -- Store any additional fields as JSON
);
CREATE INDEX IF NOT EXISTS idx_invite_codes_server_id ON server_invite_codes(server_id);

-- 10. Server Stamps
CREATE TABLE IF NOT EXISTS server_stamps (
    stamp_id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_server_stamps_server_id ON server_stamps(server_id);

-- 11. Server Stamp Groups
CREATE TABLE IF NOT EXISTS server_stamp_groups (
    group_id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    group_data TEXT NOT NULL, -- Stored as JSON string
    created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_server_stamp_groups_server_id ON server_stamp_groups(server_id);

-- 12. Rooms
CREATE TABLE IF NOT EXISTS rooms (
    room_id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'chat', 'voice', etc.
    created_by TEXT NOT NULL,
    created_at INTEGER,
    current_key_version INTEGER DEFAULT 1,
    room_data TEXT -- Store any additional fields as JSON
);
CREATE INDEX IF NOT EXISTS idx_rooms_server_id ON rooms(server_id);

-- 13. Room Keys (E2EE room keys per user)
CREATE TABLE IF NOT EXISTS room_keys (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL, -- includes '__escrow__'
    server_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    key_data TEXT NOT NULL, -- Stored as JSON string
    updated_at INTEGER,
    PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_room_keys_room_id ON room_keys(room_id);

-- 14. Messages
CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    server_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    text TEXT,
    created_at INTEGER, -- Unix timestamp in milliseconds
    is_pinned INTEGER DEFAULT 0, -- boolean: 0 or 1
    reactions TEXT, -- Stored as JSON string: { userId: emoji }
    additional_data TEXT -- Stored as JSON string (attachments, etc.)
);
CREATE INDEX IF NOT EXISTS idx_messages_room_id_created_at ON messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_room_id_pinned ON messages(room_id, is_pinned);

-- 15. Read Receipts
CREATE TABLE IF NOT EXISTS read_receipts (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    server_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    last_read_at INTEGER, -- Unix timestamp in milliseconds
    last_read_message_id TEXT,
    PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_read_receipts_room_id ON read_receipts(room_id);

-- 16. Typing States
CREATE TABLE IF NOT EXISTS typing_states (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    server_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    nickname TEXT NOT NULL,
    updated_at INTEGER, -- Unix timestamp in milliseconds
    PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_typing_states_room_id ON typing_states(room_id);

-- 17. User Online Status (Firestore status collection)
CREATE TABLE IF NOT EXISTS user_status (
    user_id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    status_data TEXT NOT NULL, -- Stored as JSON string
    updated_at INTEGER
);

-- 18. WebRTC Calls (Signaling)
CREATE TABLE IF NOT EXISTS webrtc_calls (
    call_id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    call_data TEXT NOT NULL, -- Stored as JSON string
    created_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS webrtc_call_candidates (
    candidate_id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    candidate_type TEXT NOT NULL, -- 'offer' or 'answer'
    candidate_data TEXT NOT NULL, -- Stored as JSON string
    created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_call_candidates_call_id ON webrtc_call_candidates(call_id, candidate_type);

-- 19. WebRTC File Shares (Signaling)
CREATE TABLE IF NOT EXISTS webrtc_fileshares (
    fs_id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    fs_data TEXT NOT NULL, -- Stored as JSON string
    created_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS webrtc_fileshare_candidates (
    candidate_id TEXT PRIMARY KEY,
    fs_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    candidate_type TEXT NOT NULL, -- 'sender' or 'receiver'
    candidate_data TEXT NOT NULL, -- Stored as JSON string
    created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fileshare_candidates_fs_id ON webrtc_fileshare_candidates(fs_id, candidate_type);
