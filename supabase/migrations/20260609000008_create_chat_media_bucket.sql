INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload chat media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Anyone can view chat media"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'chat-media');
