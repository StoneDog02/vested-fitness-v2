# Check-In Recording Feature

This document describes the new Loom-like recording functionality added to the check-in system.

## Overview

Coaches can now record screen and audio (or audio-only) messages for their clients during check-ins. This provides a more personal and detailed way to communicate feedback, demonstrate exercises, or explain concepts.

## Features

### For Coaches
- **Screen & Audio Recording**: Record your screen with voice narration
- **Audio-Only Recording**: Quick voice messages for simple updates
- **Pause/Resume**: Control recording flow with pause functionality
- **Duration Tracking**: See recording length in real-time
- **Automatic Upload**: Recordings are automatically uploaded to secure storage

### For Clients
- **Video/Audio Playback**: Watch or listen to coach recordings
- **Media Controls**: Play, pause, seek, and volume control
- **Responsive Design**: Works on desktop and mobile devices
- **Auto-Play Prevention**: Videos don't auto-play to save bandwidth

## Technical Implementation

### Database Changes
- Added new fields to `check_ins` table:
  - `video_url`: URL to video file
  - `audio_url`: URL to audio file
  - `recording_type`: Type of recording ('video', 'audio', 'text', 'video_audio')
  - `recording_duration`: Duration in seconds
  - `recording_thumbnail_url`: Thumbnail for video previews

### Storage
- Uses Supabase Storage bucket `checkin-media`
- Supports video formats: WebM, MP4, QuickTime
- Supports audio formats: WebM, MP3, WAV, M4A
- File size limits: 50MB for video, 10MB for audio

### Components
- `VideoRecorder`: Handles screen/audio recording
- `MediaPlayer`: Displays and controls video/audio playback
- `AddCheckInModal`: Enhanced with recording options
- `CheckInHistoryModal`: Shows recordings in history

## Setup Instructions

### 1. Run Database Migration
```bash
# Apply the migration to add new fields
supabase db push
```

### 2. Set Up Storage Bucket
```bash
# Run the setup script
node scripts/setup-checkin-storage.js
```

### 3. Configure Storage Policies
In your Supabase dashboard:
1. Go to Storage > Policies
2. Add policies for the `checkin-media` bucket:
   - Coaches can upload files
   - Users can view files for their check-ins

### 4. Environment Variables
Ensure these are set in your environment:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
```

## Usage

### Recording a Check-In
1. Navigate to a client's details page
2. Click "+Add Check In"
3. Choose recording type:
   - **Screen & Audio**: For detailed demonstrations
   - **Audio Only**: For quick voice messages
4. Allow browser permissions when prompted
5. Record your message
6. Add optional text notes
7. Save the check-in

### Viewing Recordings
1. Go to Check In History
2. Recordings appear with media players
3. Click play to watch/listen
4. Use controls to pause, seek, or adjust volume

## Browser Compatibility

### Recording
- **Chrome/Edge**: Full support for screen and audio recording
- **Firefox**: Full support for screen and audio recording
- **Safari**: Limited support (may require user interaction)

### Playback
- **All modern browsers**: Full support for video/audio playback
- **Mobile browsers**: Responsive design with touch controls

## Security Considerations

- Recordings are stored in secure Supabase Storage
- Access controlled by RLS policies
- Only coaches can upload recordings
- Clients can only view their own check-ins
- File types and sizes are validated

## Performance Notes

- Videos are compressed using WebM format for smaller file sizes
- Thumbnails are generated for video previews
- Lazy loading implemented for better performance
- Media files are served via CDN for fast delivery

## Troubleshooting

### Recording Issues
- **Permission Denied**: Ensure browser has microphone/screen access
- **File Too Large**: Reduce recording length or quality
- **Unsupported Format**: Use supported video/audio formats

### Playback Issues
- **Video Won't Play**: Check browser compatibility
- **Audio Issues**: Verify audio permissions
- **Loading Errors**: Check network connection and file availability

## Future Enhancements

- Video thumbnail generation
- Recording quality settings
- Bulk download options
- Transcription services
- Mobile app support
- Integration with external video platforms

## Support

For technical issues or questions about the recording feature, please refer to the development team or check the application logs for error details. 