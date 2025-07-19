/* eslint-env node */
const { createClient } = require('@supabase/supabase-js');

// This script sets up the storage bucket for check-in media files
// Run this after creating the migration

async function setupCheckinStorage() {
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
  );

  try {
    // Create the storage bucket for check-in media
    const { data: bucket, error: bucketError } = await supabase.storage
      .createBucket('checkin-media', {
        public: true,
        allowedMimeTypes: [
          'video/webm',
          'video/mp4', 
          'video/quicktime',
          'audio/webm',
          'audio/mp3',
          'audio/wav',
          'audio/m4a'
        ],
        fileSizeLimit: 52428800 // 50MB
      });

    if (bucketError) {
      if (bucketError.message.includes('already exists')) {
        console.log('✅ Storage bucket "checkin-media" already exists');
      } else {
        console.error('❌ Error creating storage bucket:', bucketError);
        return;
      }
    } else {
      console.log('✅ Created storage bucket "checkin-media"');
    }

    // Set up RLS policies for the bucket
    const policies = [
      {
        name: 'Coaches can upload check-in media',
        definition: `
          CREATE POLICY "Coaches can upload check-in media" ON storage.objects
          FOR INSERT WITH CHECK (
            bucket_id = 'checkin-media' AND
            auth.role() = 'authenticated' AND
            EXISTS (
              SELECT 1 FROM users 
              WHERE auth_id = auth.uid() AND role = 'coach'
            )
          );
        `
      },
      {
        name: 'Users can view check-in media for their clients',
        definition: `
          CREATE POLICY "Users can view check-in media for their clients" ON storage.objects
          FOR SELECT USING (
            bucket_id = 'checkin-media' AND
            auth.role() = 'authenticated' AND
            (
              EXISTS (
                SELECT 1 FROM users 
                WHERE auth_id = auth.uid() AND role = 'coach'
              ) OR
              EXISTS (
                SELECT 1 FROM check_ins ci
                JOIN users u ON ci.client_id = u.id
                WHERE u.auth_id = auth.uid() AND
                ci.video_url LIKE '%' || name || '%' OR
                ci.audio_url LIKE '%' || name || '%'
              )
            )
          );
        `
      }
    ];

    console.log('📝 Note: You may need to manually set up RLS policies in the Supabase dashboard');
    console.log('   - Go to Storage > Policies');
    console.log('   - Add policies for the "checkin-media" bucket');
    console.log('   - Ensure coaches can upload and users can view their check-in media');

    console.log('✅ Check-in storage setup complete!');

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

// Run the setup
setupCheckinStorage(); 