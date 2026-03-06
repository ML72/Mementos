import React, { useState, useEffect } from 'react';
import { 
  Container, Typography, Box, Paper, Avatar, Button, Stack, CircularProgress, 
  Tabs, Tab, TextField, InputAdornment, IconButton, Pagination 
} from '@mui/material';
import Grid from '@mui/material/Grid';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store/store';
import CustomPage from '../../components/layout/CustomPage';
import { searchUsers, getUserFollowers, getUserFollowing } from '../../service/user';

const PeoplePage: React.FC = () => {
  const { userId: currentUserId } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();

  const [activeTab, setActiveTab] = useState(0); // 0: Followers, 1: Following, 2: Search
  const [loading, setLoading] = useState(false);
  const [usersList, setUsersList] = useState<any[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  
  const pageSize = 10;

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    if (newValue !== 2) {
      setSearchQuery('');
      setSubmittedQuery('');
      setPage(1);
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchQuery.trim().length >= 5) {
      setActiveTab(2); // Switch to search results tab
      setSubmittedQuery(searchQuery.trim());
      setPage(1);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSubmittedQuery('');
    setActiveTab(0); // Go back to followers
  };

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      setUsersList([]);

      if (activeTab === 0) {
        // Followers
        if (currentUserId) {
          const res = await getUserFollowers(dispatch, currentUserId);
          if (res) setUsersList(res);
        }
      } else if (activeTab === 1) {
        // Following
        if (currentUserId) {
          const res = await getUserFollowing(dispatch, currentUserId);
          if (res) setUsersList(res);
        }
      } else if (activeTab === 2) {
        // Search
        if (submittedQuery.length >= 5) {
          // Page is 1-indexed in UI, 0-indexed in API
          const res = await searchUsers(dispatch, submittedQuery, page - 1, pageSize);
          if (res) {
            setUsersList(res);
            // If we got pageSize results, we might have more
            setHasMore(res.length === pageSize);
          }
        }
      }
      setLoading(false);
    };

    fetchUsers();
  }, [activeTab, submittedQuery, page, currentUserId, dispatch]);

  const getInitial = (name?: string) => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  const renderUserCard = (user: any) => (
    <Grid size={{ xs: 12, sm: 6 }} key={user.id}>
      <Paper elevation={0} sx={{ 
        p: 3, 
        borderRadius: '16px',
        border: '1px solid #E5E7EB',
        backgroundColor: '#ffffff',
        display: 'flex',
        alignItems: 'flex-start',
        cursor: 'pointer',
        transition: 'all 0.2s',
        height: '100%',
        '&:hover': {
          borderColor: '#000',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
        }
      }}
      onClick={() => window.open(`/profile/${user.id}`, '_blank')}
      >
        <Avatar sx={{ width: 56, height: 56, bgcolor: '#000', mr: 2, mt: 0.5 }}>
          {getInitial(user.fullName)}
        </Avatar>
        <Box sx={{ overflow: 'hidden' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', mb: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.fullName}
          </Typography>
          {user.bio ? (
            <Typography variant="body2" sx={{ color: '#4B5563', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {user.bio}
            </Typography>
          ) : (
            <Typography variant="body2" sx={{ color: '#9CA3AF', fontStyle: 'italic' }}>
              No bio
            </Typography>
          )}
        </Box>
      </Paper>
    </Grid>
  );

  return (
    <CustomPage showNavigation={true} useBindingContainer={false}>
      <Box sx={{ backgroundColor: '#F9FAFB', minHeight: 'calc(100vh - 65px)', pt: { xs: 4, md: 6 }, pb: 8 }}>
        <Container maxWidth="lg">
          
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, mb: 4, gap: 3 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827' }}>
              People
            </Typography>

            <Box component="form" onSubmit={handleSearchSubmit} sx={{ width: { xs: '100%', md: '400px' } }}>
              <TextField
                fullWidth
                variant="outlined"
                placeholder="Search users by name, bio, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{
                  backgroundColor: '#fff',
                  borderRadius: '24px',
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '24px',
                    pr: 1
                  }
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#6B7280' }} />
                    </InputAdornment>
                  ),
                  endAdornment: searchQuery ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={handleClearSearch}>
                        <ClearIcon fontSize="small" />
                      </IconButton>
                      <Button 
                        type="submit"
                        variant="contained" 
                        size="small"
                        disabled={searchQuery.trim().length < 5}
                        sx={{ ml: 1, borderRadius: '16px', bgcolor: '#000', '&:hover': { bgcolor: '#333' } }}
                      >
                        Search
                      </Button>
                    </InputAdornment>
                  ) : null
                }}
              />
            </Box>
          </Box>

          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}>
            <Tabs 
              value={activeTab} 
              onChange={handleTabChange} 
              TabIndicatorProps={{ style: { backgroundColor: '#000', height: 3 } }}
              sx={{ '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '1rem', color: '#6B7280' }, '& .Mui-selected': { color: '#111827 !important' } }}
            >
              <Tab label="Followers" />
              <Tab label="Following" />
              <Tab label="Search Results" disabled={activeTab !== 2 && submittedQuery.length < 5} sx={{ display: (activeTab !== 2 && submittedQuery.length < 5) ? 'none' : 'inline-flex' }} />
            </Tabs>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={40} sx={{ color: '#000' }} />
            </Box>
          ) : usersList.length === 0 ? (
            <Paper elevation={0} sx={{ p: 6, textAlign: 'center', borderRadius: '16px', border: '1px dashed #E5E7EB', backgroundColor: 'transparent' }}>
              <Typography variant="h6" sx={{ color: '#6B7280', fontWeight: 500 }}>
                {activeTab === 2 ? `No results found for "${submittedQuery}"` : `No users found`}
              </Typography>
              {activeTab === 2 && (
                <Typography variant="body2" sx={{ color: '#9CA3AF', mt: 1 }}>Try a different search term. (Minimum 5 characters)</Typography>
              )}
            </Paper>
          ) : (
            <>
              <Grid container spacing={3}>
                {usersList.map(renderUserCard)}
              </Grid>

              {activeTab === 2 && (page > 1 || hasMore) && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
                  <Pagination 
                    count={hasMore ? page + 1 : page} 
                    page={page} 
                    onChange={(_, value) => setPage(value)} 
                    color="primary"
                    sx={{
                      '& .MuiPaginationItem-root': {
                        fontWeight: 600,
                      },
                      '& .Mui-selected': {
                        backgroundColor: '#000 !important',
                        color: '#fff',
                      }
                    }}
                  />
                </Box>
              )}
            </>
          )}

        </Container>
      </Box>
    </CustomPage>
  );
};

export default PeoplePage;
