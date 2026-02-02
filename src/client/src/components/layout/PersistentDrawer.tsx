import React from 'react';
import { Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Toolbar, Box, Divider, Typography, Stack } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PersonIcon from '@mui/icons-material/Person';
import DescriptionIcon from '@mui/icons-material/Description';
import SchoolIcon from '@mui/icons-material/School';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../service/auth';
import { RootState } from '../../store/store';

const drawerWidth = 220;

const PersistentDrawer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { userId, accountRoles } = useSelector((state: RootState) => state.auth);

  const getNavItems = () => {
    const baseItems = [
      { label: 'Dashboard', icon: <DashboardIcon />, path: '/home' }
    ];

    return baseItems;
  };

  const navItems = getNavItems();

  const handleLogout = () => {
    logout(dispatch);
    navigate('/');
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          boxSizing: 'border-box',
          background: '#f8f9fa'
        }
      }}
    >
      <Toolbar sx={{ minHeight: '64px !important', borderBottom: '1px solid #e0e0e0' }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 0.5, py: 1 }}>
          <Box
            component="img"
            src="/favicon.svg"
            alt="Mementos"
            sx={{ width: 28, height: 28, display: 'block' }}
          />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
            Mementos
          </Typography>
        </Stack>
      </Toolbar>
      <Box sx={{ overflow: 'auto', mt: 1 }}>
        <List>
          {navItems.map(item => (
            <ListItem key={item.label} disablePadding>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => navigate(item.path)}
                sx={{
                  borderRadius: 2,
                  mx: 1.5,
                  my: 0.25,
                  minHeight: 40,
                  fontWeight: location.pathname === item.path ? 'bold' : undefined
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Divider sx={{ mx: 2, my: 0.5 }} />
        <List>
          <ListItem disablePadding>
            <ListItemButton
              onClick={handleLogout}

              sx={{
                borderRadius: 2,
                mx: 1.5,
                my: 0.25,
                minHeight: 40,
                color: 'error.main'
              }}
            >
              <ListItemIcon sx={{ minWidth: 32, color: 'error.main' }}>
                <LogoutIcon />
              </ListItemIcon>
              <ListItemText primary="Logout" />
            </ListItemButton>
          </ListItem>
        </List>
      </Box>
    </Drawer>
  );
};

export default PersistentDrawer;
