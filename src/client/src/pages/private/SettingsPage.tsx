import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Box, Paper, TextField, Button, CircularProgress,
  FormControlLabel, Switch, MenuItem, Link, Stack
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState } from '../../store/store';
import CustomPage from '../../components/layout/CustomPage';
import { getUserProfile, updateProfile, getSettings, updateSettings } from '../../service/user';
import { changePassword, forgotPassword, NEW_PASSWORD_HINT } from '../../service/auth';
import { setNewAlert } from '../../service/alert';

interface DigestSettings {
  weeklyDigest: boolean;
  digestDay: number;          // 0 = Sunday ... 6 = Saturday, as Date#getUTCDay
  nextDigestAt: string | null;
}

// The week as people read it, Monday first; values are what the API stores (0 = Sunday).
const DIGEST_DAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' }
];

const WHEN: Intl.DateTimeFormatOptions = {
  weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
};

// Digests go out at 12AM UTC, which is a different day for much of the world, so say when that
// is in the reader's own time zone as well.
const describeNextDigest = (iso: string): string => {
  const when = new Date(iso);
  if (when.getTime() <= Date.now()) return 'Your next digest is on its way.';
  const utc = when.toLocaleString(undefined, { ...WHEN, timeZone: 'UTC' });
  const local = when.toLocaleString(undefined, WHEN);
  return utc === local
    ? `Your next digest arrives ${utc}.`
    : `Your next digest arrives ${utc}, which is ${local} for you.`;
};

const sectionSx = {
  p: { xs: 3, md: 4 },
  borderRadius: '16px',
  border: '1px solid #E5E7EB',
  backgroundColor: '#ffffff'
};
const headingSx = { fontWeight: 700, color: '#111827', mb: 2 };
const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '8px' } };
const buttonSx = {
  backgroundColor: '#000', color: '#fff', px: 4, py: 1.5,
  fontWeight: 600, borderRadius: '8px', textTransform: 'none',
  boxShadow: 'none', '&:hover': { backgroundColor: '#333', boxShadow: 'none' }
};
const switchSx = {
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#000' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#000' }
};

const SettingsPage: React.FC = () => {
  const { userId, email } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');

  const [digest, setDigest] = useState<DigestSettings | null>(null);
  const [savingDigest, setSavingDigest] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      if (userId) {
        const [profile, settings] = await Promise.all([getUserProfile(dispatch, userId), getSettings(dispatch)]);
        if (profile) {
          setFullName(profile.fullName || '');
          setBio(profile.bio || '');
        }
        if (settings) setDigest(settings);
      }
      setLoading(false);
    };

    fetchSettings();
  }, [dispatch, userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateProfile(dispatch, { fullName, bio });
    setSaving(false);
  };

  // Digest changes save as soon as they are made; the reply says when the next digest is due.
  const saveDigest = async (changes: { weeklyDigest?: boolean; digestDay?: number }) => {
    setSavingDigest(true);
    const updated = await updateSettings(dispatch, changes);
    if (updated) setDigest(updated);
    setSavingDigest(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      setNewAlert(dispatch, { msg: 'Please enter your current and new password', alertType: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNewAlert(dispatch, { msg: 'Passwords do not match', alertType: 'error' });
      return;
    }
    setChangingPassword(true);
    const ok = await changePassword(dispatch, { currentPassword, newPassword });
    setChangingPassword(false);
    if (ok) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleForgotCurrentPassword = async () => {
    if (!email) return;
    setSendingReset(true);
    const ok = await forgotPassword(dispatch, email);
    setSendingReset(false);
    if (ok) navigate(`/reset-password?email=${encodeURIComponent(email)}`);
  };

  return (
    <CustomPage title="Settings" showNavigation={true} useBindingContainer={false}>
      <Box sx={{ backgroundColor: '#F9FAFB', minHeight: 'calc(100vh - 65px)', pt: { xs: 4, md: 6 }, pb: 8 }}>
        <Container maxWidth="sm">
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827', mb: 4 }}>
            Settings
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={40} sx={{ color: '#000' }} />
            </Box>
          ) : (
            <Stack spacing={3}>
              <Paper elevation={0} sx={sectionSx}>
                <Typography variant="h6" sx={headingSx}>Profile</Typography>
                <Box component="form" onSubmit={handleSubmit}>
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#4B5563', mb: 1 }}>Full Name</Typography>
                    <TextField
                      fullWidth
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      variant="outlined"
                      InputProps={{ sx: { borderRadius: '8px' } }}
                      required
                    />
                  </Box>

                  <Box sx={{ mb: 4 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#4B5563', mb: 1 }}>Bio</Typography>
                    <TextField
                      fullWidth
                      multiline
                      rows={4}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      variant="outlined"
                      InputProps={{ sx: { borderRadius: '8px' } }}
                    />
                  </Box>

                  <Button
                    type="submit"
                    variant="contained"
                    disabled={saving}
                    sx={buttonSx}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </Box>
              </Paper>

              {digest && (
                <Paper elevation={0} sx={sectionSx}>
                  <Typography variant="h6" sx={{ ...headingSx, mb: 1 }}>Weekly digest</Typography>
                  <Typography variant="body2" sx={{ color: '#4B5563', mb: 2 }}>
                    Once a week we email you a few notes to review, from you and the people you follow,
                    plus a reminder to write down this week's note. It goes out at 12:00 AM UTC on the day you pick.
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={digest.weeklyDigest}
                        disabled={savingDigest}
                        onChange={(e) => saveDigest({ weeklyDigest: e.target.checked })}
                        sx={switchSx}
                      />
                    }
                    label="Email me the weekly digest"
                    sx={{ mb: 2 }}
                  />
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#4B5563', mb: 1 }}>Send it on</Typography>
                    <TextField
                      select
                      fullWidth
                      value={digest.digestDay}
                      disabled={!digest.weeklyDigest || savingDigest}
                      onChange={(e) => saveDigest({ digestDay: Number(e.target.value) })}
                      variant="outlined"
                      sx={fieldSx}
                    >
                      {DIGEST_DAYS.map(day => (
                        <MenuItem key={day.value} value={day.value}>{day.label} (12:00 AM UTC)</MenuItem>
                      ))}
                    </TextField>
                  </Box>
                  <Typography variant="body2" sx={{ color: '#111827', fontWeight: 500 }}>
                    {digest.weeklyDigest && digest.nextDigestAt
                      ? describeNextDigest(digest.nextDigestAt)
                      : 'Weekly digests are off.'}
                  </Typography>
                  {digest.weeklyDigest && (
                    <Typography variant="caption" sx={{ display: 'block', color: '#6B7280', mt: 1 }}>
                      Digests are always at least 6 days apart, so switching to a nearby day can skip a week.
                    </Typography>
                  )}
                </Paper>
              )}

              <Paper elevation={0} sx={sectionSx}>
                <Typography variant="h6" sx={headingSx}>Password</Typography>
                <Box component="form" onSubmit={handleChangePassword}>
                  <Stack spacing={2} sx={{ mb: 3 }}>
                    <TextField
                      fullWidth
                      type="password"
                      label="Current password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      variant="outlined"
                      sx={fieldSx}
                    />
                    <TextField
                      fullWidth
                      type="password"
                      label="New password"
                      autoComplete="new-password"
                      helperText={NEW_PASSWORD_HINT}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      variant="outlined"
                      sx={fieldSx}
                    />
                    <TextField
                      fullWidth
                      type="password"
                      label="Confirm new password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      variant="outlined"
                      sx={fieldSx}
                    />
                  </Stack>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={changingPassword}
                  sx={buttonSx}
                >
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </Button>
                <Typography variant="body2" sx={{ color: '#6B7280', mt: 2 }}>
                  Changing your password signs you out on every other device.{' '}
                  <Link component="button" type="button" underline="hover" disabled={sendingReset} onClick={handleForgotCurrentPassword}
                    sx={{ color: '#111827', fontWeight: 500, verticalAlign: 'baseline' }}>
                    {sendingReset ? 'Sending a code…' : 'Forgot your current password? Reset it by email'}
                  </Link>
                </Typography>
              </Box>
            </Paper>
            </Stack>
          )}
        </Container>
      </Box>
    </CustomPage>
  );
};

export default SettingsPage;
