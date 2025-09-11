#!/usr/bin/env node

/**
 * Script to manage expired check-in forms
 * Run with: node scripts/manage-expired-forms.js [action]
 * Actions: list, extend, cleanup
 */

/* eslint-env node */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function listExpiredForms() {
  console.log('📋 Listing expired forms...\n');
  
  const { data: expiredForms, error } = await supabase
    .from('check_in_form_instances')
    .select(`
      id,
      status,
      sent_at,
      expires_at,
      check_in_forms!inner (title),
      users!check_in_form_instances_client_id_fkey (name)
    `)
    .lt('expires_at', new Date().toISOString())
    .order('sent_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching expired forms:', error.message);
    return;
  }

  if (expiredForms.length === 0) {
    console.log('✅ No expired forms found');
    return;
  }

  console.log(`Found ${expiredForms.length} expired forms:\n`);
  
  expiredForms.forEach((form, index) => {
    const sentDate = new Date(form.sent_at).toLocaleDateString();
    const expiredDate = new Date(form.expires_at).toLocaleDateString();
    console.log(`${index + 1}. ${form.check_in_forms.title}`);
    console.log(`   Client: ${form.users.name}`);
    console.log(`   Status: ${form.status}`);
    console.log(`   Sent: ${sentDate}`);
    console.log(`   Expired: ${expiredDate}`);
    console.log('');
  });
}

async function extendExpiredForms(days = 7) {
  console.log(`🔄 Extending expired forms by ${days} days...\n`);
  
  const { data: expiredForms, error: fetchError } = await supabase
    .from('check_in_form_instances')
    .select('id, expires_at')
    .lt('expires_at', new Date().toISOString())
    .eq('status', 'sent'); // Only extend forms that haven't been completed

  if (fetchError) {
    console.error('❌ Error fetching expired forms:', fetchError.message);
    return;
  }

  if (expiredForms.length === 0) {
    console.log('✅ No expired forms to extend');
    return;
  }

  const newExpirationDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  
  const { error: updateError } = await supabase
    .from('check_in_form_instances')
    .update({ expires_at: newExpirationDate })
    .in('id', expiredForms.map(f => f.id));

  if (updateError) {
    console.error('❌ Error extending forms:', updateError.message);
    return;
  }

  console.log(`✅ Extended ${expiredForms.length} forms until ${new Date(newExpirationDate).toLocaleDateString()}`);
}

async function cleanupExpiredForms() {
  console.log('🧹 Cleaning up old expired forms...\n');
  
  // Delete forms that expired more than 30 days ago
  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: oldForms, error: fetchError } = await supabase
    .from('check_in_form_instances')
    .select('id, check_in_forms!inner (title)')
    .lt('expires_at', cutoffDate)
    .eq('status', 'expired');

  if (fetchError) {
    console.error('❌ Error fetching old forms:', fetchError.message);
    return;
  }

  if (oldForms.length === 0) {
    console.log('✅ No old forms to clean up');
    return;
  }

  console.log(`Found ${oldForms.length} forms to clean up (expired >30 days ago)`);
  
  const { error: deleteError } = await supabase
    .from('check_in_form_instances')
    .delete()
    .in('id', oldForms.map(f => f.id));

  if (deleteError) {
    console.error('❌ Error cleaning up forms:', deleteError.message);
    return;
  }

  console.log(`✅ Cleaned up ${oldForms.length} old forms`);
}

async function main() {
  const action = process.argv[2] || 'list';
  
  console.log('🔧 Check-In Form Management Tool\n');
  
  switch (action) {
    case 'list':
      await listExpiredForms();
      break;
    case 'extend': {
      const days = parseInt(process.argv[3]) || 7;
      await extendExpiredForms(days);
      break;
    }
    case 'cleanup':
      await cleanupExpiredForms();
      break;
    default:
      console.log('Usage: node scripts/manage-expired-forms.js [action]');
      console.log('Actions:');
      console.log('  list     - List all expired forms');
      console.log('  extend   - Extend expired forms by 7 days (or specify days)');
      console.log('  cleanup  - Remove forms expired >30 days ago');
      console.log('');
      console.log('Examples:');
      console.log('  node scripts/manage-expired-forms.js list');
      console.log('  node scripts/manage-expired-forms.js extend 14');
      console.log('  node scripts/manage-expired-forms.js cleanup');
  }
}

main().catch(console.error);
