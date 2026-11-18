alter table auth_users
    add column avatar_id uuid,
    add column avatar_file_name varchar(255),
    add column avatar_media_type varchar(100),
    add column avatar_object_key text,
    add column profile_updated_at timestamptz;

alter table auth_users
    add constraint auth_users_avatar_fields_check check (
        (avatar_id is null and avatar_file_name is null and avatar_media_type is null and avatar_object_key is null)
        or
        (avatar_id is not null and avatar_file_name is not null and avatar_media_type is not null and avatar_object_key is not null)
    );
