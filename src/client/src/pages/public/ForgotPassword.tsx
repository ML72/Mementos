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
import { forgotPassword } from '../../service/auth';
import CustomPage from '../../components/layout/CustomPage';

const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '8px' } };

/**
 * First step of a password reset: ask for the address and email a code to it, then hand over
 * to /reset-password. Also how someone takes back an account another person registered with
 * their address. The address can arrive in the URL (?email=), e.g. from the sign-in form.
 */
const ForgotPassword: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(new URLSearchParams(location.search).get('email') || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setNewAlert(dispatch, { msg: 'Please enter a valid email address', alertType: 'error' });
      return;
    }
    setSubmitting(true);
    const ok = await forgotPassword(dispatch, email.trim());
    setSubmitting(false);
    if (ok) navigate(`/reset-password?email=${encodeURIComponent(email.trim())}`);
  };

  return (
    <CustomPage showNavigation={true} useBindingContainer={false}>
      <Box sx={{ backgroundColor: '#F9FAFB', minHeight: 'calc(100vh - 65px)', pt: { xs: 8, md: 16 }, pb: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Container maxWidth="xs" sx={{ mt: 0 }}>
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#111827', mb: 1, letterSpacing: '-0.5px' }}>
              Reset your password
            </Typography>
            <Typography variant="body1" sx={{ color: '#4B5563' }}>
              Enter your account's email address and we'll send you a code to choose a new password.
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
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  {submitting ? 'Sending…' : 'Email me a code'}
                </Button>
                <Typography variant="body2" sx={{ color: '#6B7280', textAlign: 'center' }}>
                  Someone else signed up with your address? Resetting the password makes the account yours and signs them out.
                </Typography>
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

export default ForgotPassword;
