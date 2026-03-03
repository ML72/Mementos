import React from 'react';
import { Box, Typography, Stack, Button, IconButton, Menu, MenuItem } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../service/auth';
import { RootState } from '../../store/store';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';

const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  const userId = useSelector((state: RootState) => state.auth.userId);

  const [mobileMoreAnchorEl, setMobileMoreAnchorEl] = React.useState<null | HTMLElement>(null);
  const isMobileMenuOpen = Boolean(mobileMoreAnchorEl);

  const handleMobileMenuClose = () => {
    setMobileMoreAnchorEl(null);
  };

  const handleMobileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMobileMoreAnchorEl(event.currentTarget);
  };

  const handleLogout = () => {
    logout(dispatch);
    navigate('/');
    handleMobileMenuClose();
  };

  return (
    <Box sx={{ width: '100%', borderBottom: '1px solid #eaeaea', py: 2, px: { xs: 2, md: 4 }, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', position: 'sticky', top: 0, zIndex: 1100 }}>
      {/* Left section: Logo and Links */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ cursor: 'pointer', mr: 4 }} onClick={() => navigate('/')}>
          <Box
            component="img"
            src="/favicon.svg"
            alt="Mementos"
            sx={{ width: 28, height: 28, display: 'block' }}
          />
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#000', letterSpacing: '-0.5px' }}>
            Mementos
          </Typography>
        </Stack>

        <Stack direction="row" spacing={2} sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center' }}>
          {isAuthenticated ? (
            <>
              <Button color="inherit" onClick={() => navigate('/notes')} sx={{ textTransform: 'none', fontWeight: 600 }}>
                Notes
              </Button>
              <Button color="inherit" onClick={() => navigate(`/profile/${userId}`)} sx={{ textTransform: 'none', fontWeight: 600 }}>
                Profile
              </Button>
              <Button color="inherit" onClick={() => navigate('/settings')} sx={{ textTransform: 'none', fontWeight: 600 }}>
                Settings
              </Button>
            </>
          ) : (
            <>
              <Button color="inherit" onClick={() => navigate('/about')} sx={{ textTransform: 'none', fontWeight: 600 }}>About</Button>
            </>
          )}
        </Stack>
      </Box>

      {/* Right section: Action Buttons (Desktop view) */}
      <Stack direction="row" spacing={2} sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center' }}>
        {isAuthenticated ? (
          <>
            <Button onClick={handleLogout} variant="outlined" sx={{ textTransform: 'none', fontWeight: 600, borderColor: '#d1d1d1', color: '#000', borderRadius: '20px' }}>
              Logout
            </Button>
            <Button onClick={() => navigate('/notes/new')} variant="contained" sx={{ textTransform: 'none', fontWeight: 600, backgroundColor: '#000', color: '#fff', borderRadius: '20px', '&:hover': { backgroundColor: '#333' } }}>
              New Note
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => navigate('/login?tab=login')} variant="outlined" sx={{ textTransform: 'none', fontWeight: 600, borderColor: '#d1d1d1', color: '#000', borderRadius: '20px' }}>Sign in</Button>
            <Button onClick={() => navigate('/login?tab=signup')} variant="contained" sx={{ textTransform: 'none', fontWeight: 600, backgroundColor: '#000', color: '#fff', borderRadius: '20px', '&:hover': { backgroundColor: '#333' } }}>Sign up</Button>
          </>
        )}
      </Stack>

      {/* Mobile view */}
      <Box sx={{ display: { xs: 'flex', sm: 'none' } }}>
        <IconButton size="large" aria-label="show more" aria-haspopup="true" onClick={handleMobileMenuOpen} color="inherit">
          <MenuIcon />
        </IconButton>
      </Box>

      <Menu
        anchorEl={mobileMoreAnchorEl}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        keepMounted
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={isMobileMenuOpen}
        onClose={handleMobileMenuClose}
      >
        {isAuthenticated ? [
          <MenuItem key="notes" onClick={() => { navigate('/notes'); handleMobileMenuClose(); }}>Notes</MenuItem>,
          <MenuItem key="profile" onClick={() => { navigate(`/profile/${userId}`); handleMobileMenuClose(); }}>Profile</MenuItem>,
          <MenuItem key="settings" onClick={() => { navigate('/settings'); handleMobileMenuClose(); }}>Settings</MenuItem>,
          <MenuItem key="new_note" onClick={() => { navigate('/notes/new'); handleMobileMenuClose(); }}>New Note</MenuItem>,
          <MenuItem key="logout" onClick={handleLogout}>Logout</MenuItem>
        ] : [
          <MenuItem key="about" onClick={() => { navigate('/about'); handleMobileMenuClose(); }}>About</MenuItem>,
          <MenuItem key="login" onClick={() => { navigate('/login?tab=login'); handleMobileMenuClose(); }}>Sign in</MenuItem>,
          <MenuItem key="signup" onClick={() => { navigate('/login?tab=signup'); handleMobileMenuClose(); }}>Sign up</MenuItem>
        ]}
      </Menu>
    </Box>
  );
};

export default Navbar;
