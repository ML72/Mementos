import React, { useState } from 'react';
import {
  Container,
  Typography,
  TextField,
  Button,
  Box,
  Paper,
  Stack,
  Link
} from '@mui/material';
import { useDispatch } from 'react-redux';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { setNewAlert } from '../../service/alert';
import { forgotPassword, resetPassword } from '../../service/auth';
import CustomPage from '../../components/layout/CustomPage';

// Mirror EMAIL.PASSWORD_RESET in src/server/settings.ts (the client cannot import server code).
const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 30;
const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '8px' } };

/**
 * Second step of a password reset: enter the emailed code and a new password. Success signs in
 * here and signs every other session out. The email arrives in the URL (?email=) so a refresh, or
 * the link in the email itself, lands on a filled-in form. Open to signed-in users too, for
 * Settings' "forgot your current password?" path.
 */
const ResetPassword: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(new URLSearchParams(location.search).get('email') || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const validEmail = () => {
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setNewAlert(dispatch, { msg: 'Please enter a valid email address', alertType: 'error' });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validEmail()) return;
    if (code.length !== CODE_LENGTH) {
      setNewAlert(dispatch, { msg: `Please enter the ${CODE_LENGTH}-digit code from your email`, alertType: 'error' });
      return;
    }
    if (!password) {
      setNewAlert(dispatch, { msg: 'Please choose a new password', alertType: 'error' });
      return;
    }
    if (password !== confirmPassword) {
      setNewAlert(dispatch, { msg: 'Passwords do not match', alertType: 'error' });
      return;
    }
    setSubmitting(true);
    const ok = await resetPassword(dispatch, { email: email.trim(), code, password });
    setSubmitting(false);
    if (ok) navigate('/home');
  };

  const handleResend = async () => {
    if (!validEmail()) return;
    setResending(true);
    await forgotPassword(dispatch, email.trim());
    setResending(false);
  };

  return (
    <CustomPage showNavigation={true} useBindingContainer={false}>
      <Box sx={{ backgroundColor: '#F9FAFB', minHeight: 'calc(100vh - 65px)', pt: { xs: 8, md: 16 }, pb: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Container maxWidth="xs" sx={{ mt: 0 }}>
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#111827', mb: 1, letterSpacing: '-0.5px' }}>
              Choose a new password
            </Typography>
            <Typography variant="body1" sx={{ color: '#4B5563' }}>
              We emailed a {CODE_LENGTH}-digit code to {email || 'your address'}. It expires in {CODE_EXPIRY_MINUTES} minutes.
            </Typography>
          </Box>

          <Paper elevation={0} sx={{
            p: { xs: 3, md: 5 },
            borderRadius: '16px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)'
          }}>
            <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
              <Stack spacing={2.5}>
                <TextField
                  fullWidth
                  id="email"
                  label="Email Address"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  variant="outlined"
                  sx={fieldSx}
                />
                <TextField
                  fullWidth
                  id="code"
                  label="Reset code"
                  name="code"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                  slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', maxLength: CODE_LENGTH } }}
                  variant="outlined"
                  sx={fieldSx}
                />
                <TextField
                  fullWidth
                  id="password"
                  label="New password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  variant="outlined"
                  sx={fieldSx}
                />
                <TextField
                  fullWidth
                  id="confirmPassword"
                  label="Confirm new password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  variant="outlined"
                  sx={fieldSx}
                />
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={submitting}
                  sx={{
                    mt: 1,
                    py: 1.5,
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    backgroundColor: '#000000',
                    color: '#ffffff',
                    borderRadius: '8px',
                    textTransform: 'none',
                    boxShadow: 'none',
                    '&:hover': { backgroundColor: '#333333', boxShadow: 'none' }
                  }}
                >
                  {submitting ? 'Resetting…' : 'Reset password and sign in'}
                </Button>
                <Typography variant="body2" sx={{ color: '#6B7280', textAlign: 'center' }}>
                  This signs the account out on every other device.
                </Typography>
                <Box sx={{ textAlign: 'center' }}>
                  <Link component="button" type="button" underline="hover" disabled={resending} onClick={handleResend}
                    sx={{ fontSize: '0.9rem', color: '#4B5563', fontWeight: 500 }}>
                    {resending ? 'Sending…' : "Didn't get a code? Send another"}
                  </Link>
                </Box>
              </Stack>
            </Box>
          </Paper>

          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Link component={RouterLink} to="/login" underline="hover" sx={{ fontSize: '0.9rem', color: '#4B5563', fontWeight: 500 }}>
              Back to sign in
            </Link>
          </Box>
        </Container>
      </Box>
    </CustomPage>
  );
};

export default ResetPassword;
