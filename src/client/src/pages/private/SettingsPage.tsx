import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Paper, TextField, Button, CircularProgress, Switch, FormControlLabel
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store/store';
import CustomPage from '../../components/layout/CustomPage';
import { getUserProfile, updateProfile, getSettings, updateSettings } from '../../service/user';

const SettingsPage: React.FC = () => {
  const { userId } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');

  // Email preferences. `null` until loaded so the switch never flashes a wrong default.
  const [weeklyDigest, setWeeklyDigest] = useState<boolean | null>(null);
  const [savingDigest, setSavingDigest] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      if (userId) {
        const [data, settings] = await Promise.all([
          getUserProfile(dispatch, userId),
          getSettings(dispatch)
        ]);
        if (data) {
          setFullName(data.fullName || '');
          setBio(data.bio || '');
        }
        if (settings) {
          setWeeklyDigest(settings.weeklyDigest);
        }
      }
      setLoading(false);
    };

    fetchProfile();
  }, [dispatch, userId]);

  const handleDigestToggle = async (checked: boolean) => {
    const previous = weeklyDigest;
    setWeeklyDigest(checked);
    setSavingDigest(true);
    const saved = await updateSettings(dispatch, { weeklyDigest: checked });
    setSavingDigest(false);
    // Roll the switch back if the save failed, so it never shows a state the server doesn't hold.
    setWeeklyDigest(saved ? saved.weeklyDigest : previous);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateProfile(dispatch, { fullName, bio });
    setSaving(false);
  };

  return (
    <CustomPage showNavigation={true} useBindingContainer={false}>
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
            <Paper elevation={0} sx={{ 
              p: { xs: 3, md: 4 }, 
              borderRadius: '16px',
              border: '1px solid #E5E7EB',
              backgroundColor: '#ffffff'
            }}>
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
                  sx={{ 
                    backgroundColor: '#000', color: '#fff', px: 4, py: 1.5, 
                    fontWeight: 600, borderRadius: '8px', textTransform: 'none',
                    boxShadow: 'none', '&:hover': { backgroundColor: '#333', boxShadow: 'none' }
                  }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </Box>
            </Paper>
          )}

          {!loading && (
            <Paper elevation={0} sx={{ 
              mt: 3,
              p: { xs: 3, md: 4 }, 
              borderRadius: '16px',
              border: '1px solid #E5E7EB',
              backgroundColor: '#ffffff'
            }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>
                Email
              </Typography>
              <Typography variant="body2" sx={{ color: '#6B7280', mb: 2 }}>
                Once a week we can send you a handful of notes from your feed — your own notes that are due for review and new ones from people you follow.
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={weeklyDigest === true}
                    disabled={weeklyDigest === null || savingDigest}
                    onChange={(e) => handleDigestToggle(e.target.checked)}
                    inputProps={{ 'aria-label': 'Weekly digest email' }}
                  />
                }
                label={
                  <Typography sx={{ fontWeight: 600, color: '#4B5563' }}>
                    Weekly digest email
                  </Typography>
                }
              />
              {weeklyDigest === null && (
                <Typography variant="caption" sx={{ display: 'block', color: '#9CA3AF', mt: 1 }}>
                  Email preferences could not be loaded.
                </Typography>
              )}
            </Paper>
          )}
        </Container>
      </Box>
    </CustomPage>
  );
};

export default SettingsPage;
