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
import { requestPasswordReset, resetPassword } from '../../service/auth';
import CustomPage from '../../components/layout/CustomPage';

const CODE_LENGTH = 6;
const PASSWORD_MIN_LENGTH = 8;

const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '8px' } };
const buttonSx = {
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
};

/**
 * Two steps on one page: ask for a code, then redeem it. The step is derived from the URL
 * (?step=code) so a refresh or a shared link lands on the right form, and the email carries
 * over between them. Someone who already has a code can jump straight to step two.
 */
const ForgotPassword: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const step: 'request' | 'code' = params.get('step') === 'code' ? 'code' : 'request';

  const [email, setEmail] = useState(params.get('email') || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const goTo = (nextStep: 'request' | 'code', replace = false) => {
    const query = new URLSearchParams();
    if (nextStep === 'code') query.set('step', 'code');
    if (email) query.set('email', email);
    const search = query.toString();
    navigate(`/forgot-password${search ? `?${search}` : ''}`, { replace });
  };

  const validEmail = () => {
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setNewAlert(dispatch, { msg: 'Please enter a valid email address', alertType: 'error' });
      return false;
    }
    return true;
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validEmail()) return;
    setSubmitting(true);
    const ok = await requestPasswordReset(dispatch, email.trim());
    setSubmitting(false);
    if (ok) goTo('code');
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validEmail()) return;
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code.trim())) {
      setNewAlert(dispatch, { msg: `Please enter the ${CODE_LENGTH}-digit code from your email`, alertType: 'error' });
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setNewAlert(dispatch, { msg: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`, alertType: 'error' });
      return;
    }
    if (password !== confirmPassword) {
      setNewAlert(dispatch, { msg: 'Passwords do not match', alertType: 'error' });
      return;
    }
    setSubmitting(true);
    const ok = await resetPassword(dispatch, { email: email.trim(), code: code.trim(), password });
    setSubmitting(false);
    if (ok) navigate('/login', { replace: true });
  };

  const isRequest = step === 'request';

  return (
    <CustomPage showNavigation={true} useBindingContainer={false}>
      <Box sx={{ backgroundColor: '#F9FAFB', minHeight: 'calc(100vh - 65px)', pt: { xs: 8, md: 16 }, pb: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Container maxWidth="xs" sx={{ mt: 0 }}>
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#111827', mb: 1, letterSpacing: '-0.5px' }}>
              {isRequest ? 'Forgot your password?' : 'Enter your reset code'}
            </Typography>
            <Typography variant="body1" sx={{ color: '#4B5563' }}>
              {isRequest
                ? "Enter your email and we'll send you a code to reset it"
                : `We emailed a ${CODE_LENGTH}-digit code to ${email || 'your address'}. It expires in 30 minutes.`}
            </Typography>
          </Box>

          <Paper elevation={0} sx={{
            p: { xs: 3, md: 5 },
            borderRadius: '16px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)'
          }}>
            {isRequest ? (
              <Box component="form" onSubmit={handleRequest} sx={{ width: '100%' }}>
                <Stack spacing={2.5}>
                  <TextField
                    fullWidth
                    id="email"
                    label="Email Address"
                    name="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    variant="outlined"
                    sx={fieldSx}
                  />
                  <Button type="submit" fullWidth variant="contained" size="large" disabled={submitting} sx={buttonSx}>
                    {submitting ? 'Sending…' : 'Send reset code'}
                  </Button>
                  <Box sx={{ textAlign: 'center' }}>
                    <Link component="button" type="button" underline="hover" onClick={() => goTo('code')}
                      sx={{ fontSize: '0.9rem', color: '#4B5563', fontWeight: 500 }}>
                      I already have a code
                    </Link>
                  </Box>
                </Stack>
              </Box>
            ) : (
              <Box component="form" onSubmit={handleReset} sx={{ width: '100%' }}>
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
                    name="password"
                    label="New password"
                    type="password"
                    id="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    variant="outlined"
                    sx={fieldSx}
                  />
                  <TextField
                    fullWidth
                    name="confirmPassword"
                    label="Confirm new password"
                    type="password"
                    id="confirmPassword"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    variant="outlined"
                    sx={fieldSx}
                  />
                  <Button type="submit" fullWidth variant="contained" size="large" disabled={submitting} sx={buttonSx}>
                    {submitting ? 'Resetting…' : 'Reset password'}
                  </Button>
                  <Box sx={{ textAlign: 'center' }}>
                    <Link component="button" type="button" underline="hover" onClick={() => goTo('request')}
                      sx={{ fontSize: '0.9rem', color: '#4B5563', fontWeight: 500 }}>
                      Didn't get a code? Send another
                    </Link>
                  </Box>
                </Stack>
              </Box>
            )}
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

export default ForgotPassword;
