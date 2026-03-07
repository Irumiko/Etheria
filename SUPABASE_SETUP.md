# Configuración de Supabase para Etheria

Este documento describe los pasos necesarios para configurar Supabase y habilitar la sincronización completa de datos entre dispositivos.

## Tablas Requeridas

### 1. Tabla `user_data`

Almacena los datos sincronizados de cada usuario.

```sql
CREATE TABLE user_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Índice para búsquedas por user_id
CREATE INDEX idx_user_data_user_id ON user_data(user_id);
```

### 2. Tabla `messages` (ya debería existir)

Almacena los mensajes en tiempo real.

```sql
CREATE TABLE messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    story_id UUID,
    character_id UUID,
    author TEXT,
    content JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_story_id ON messages(story_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

### 3. Tabla `profiles`

Almacena los perfiles globales de jugadores.

```sql
CREATE TABLE profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    stats JSONB DEFAULT '{}',
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para búsquedas por owner
CREATE INDEX idx_profiles_owner ON profiles(owner_user_id);
```

### 4. Tabla `characters`

Almacena los personajes de cada perfil.

```sql
CREATE TABLE characters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    stats JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para búsquedas por profile
CREATE INDEX idx_characters_profile ON characters(profile_id);
```

## Políticas RLS (Row Level Security)

### Tabla `user_data`

```sql
-- Habilitar RLS
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

-- Política: usuarios solo pueden ver sus propios datos
CREATE POLICY "Users can view own data" ON user_data
    FOR SELECT USING (auth.uid() = user_id);

-- Política: usuarios solo pueden insertar sus propios datos
CREATE POLICY "Users can insert own data" ON user_data
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Política: usuarios solo pueden actualizar sus propios datos
CREATE POLICY "Users can update own data" ON user_data
    FOR UPDATE USING (auth.uid() = user_id);

-- Política: usuarios solo pueden eliminar sus propios datos
CREATE POLICY "Users can delete own data" ON user_data
    FOR DELETE USING (auth.uid() = user_id);
```

### Tabla `messages`

```sql
-- Habilitar RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Política: lectura pública para mensajes (cualquiera puede leer)
CREATE POLICY "Messages are viewable by everyone" ON messages
    FOR SELECT USING (true);

-- Política: usuarios autenticados pueden insertar
CREATE POLICY "Authenticated users can insert messages" ON messages
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
```

### Tabla `profiles`

```sql
-- Habilitar RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Política: lectura pública
CREATE POLICY "Profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);

-- Política: usuarios autenticados pueden crear
CREATE POLICY "Authenticated users can create profiles" ON profiles
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Política: solo el dueño puede actualizar
CREATE POLICY "Only owner can update profile" ON profiles
    FOR UPDATE USING (auth.uid() = owner_user_id);
```

### Tabla `characters`

```sql
-- Habilitar RLS
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

-- Política: lectura pública
CREATE POLICY "Characters are viewable by everyone" ON characters
    FOR SELECT USING (true);

-- Política: solo el dueño del perfil puede crear personajes
CREATE POLICY "Only profile owner can create characters" ON characters
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = characters.profile_id 
            AND profiles.owner_user_id = auth.uid()
        )
    );

-- Política: solo el dueño del perfil puede actualizar
CREATE POLICY "Only profile owner can update characters" ON characters
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = characters.profile_id 
            AND profiles.owner_user_id = auth.uid()
        )
    );
```

## Realtime (Para mensajes en tiempo real)

Habilitar Realtime para la tabla `messages`:

```sql
-- Habilitar realtime para la tabla messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

## Configuración en el Dashboard de Supabase

1. Ve a tu proyecto de Supabase
2. Navega a "Database" → "Tables"
3. Crea las tablas faltantes usando los SQL anteriores
4. Ve a "Authentication" → "Policies" para verificar las políticas RLS
5. Ve a "Database" → "Replication" → "Realtime" y asegúrate de que `messages` esté habilitada

## Verificación

Después de configurar todo, verifica que:

1. Los usuarios pueden registrarse e iniciar sesión
2. Los datos se sincronizan entre dispositivos
3. Los mensajes en tiempo real funcionan en las historias colaborativas
4. Los perfiles y personajes se cargan correctamente

## Solución de Problemas

### Los datos no se sincronizan

1. Verifica que la tabla `user_data` existe
2. Verifica que las políticas RLS están configuradas correctamente
3. Revisa la consola del navegador para errores de Supabase

### Error "No autenticado"

1. Verifica que el usuario ha iniciado sesión
2. Verifica que la sesión no ha expirado
3. Revisa las políticas RLS de la tabla `user_data`

### Realtime no funciona

1. Verifica que Realtime está habilitado para la tabla `messages`
2. Verifica que el canal de suscripción está configurado correctamente
3. Revisa los logs de Supabase para errores de Realtime
