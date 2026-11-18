create table platform_contact_settings (
    id smallint primary key default 1 check (id = 1),
    contact_name varchar(120) not null default '',
    phone varchar(80) not null default '',
    email varchar(320) not null default '',
    wechat varchar(120) not null default '',
    message varchar(500) not null default '账号已停用或删除，请联系平台管理员。',
    updated_at timestamptz not null default now(),
    updated_by uuid references auth_users(id) on delete set null
);

insert into platform_contact_settings(id) values (1);
