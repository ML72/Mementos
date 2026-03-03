import axios from 'axios';
import { setNewAlert } from './alert';

export const getUserProfile = async (dispatch: any, userId: string) => {
  try {
    const res = await axios.get('/api/users/' + userId + '/profile');
    return res.data;
  } catch (err: any) {
    const errors = err.response?.data?.errors;
    if (errors) {
      errors.forEach((error: any) => setNewAlert(dispatch, { msg: error, alertType: 'error' }));
    } else {
      setNewAlert(dispatch, { msg: err.response?.data?.msg || 'Could not fetch profile', alertType: 'error' });
    }
    return null;
  }
};

export const updateProfile = async (dispatch: any, data: { fullName?: string; bio?: string }) => {
  try {
    const res = await axios.put('/api/users/profile', data);
    setNewAlert(dispatch, { msg: 'Profile updated successfully', alertType: 'success' });
    return res.data;
  } catch (err: any) {
    const errors = err.response?.data?.errors;
    if (errors) {
      errors.forEach((error: any) => setNewAlert(dispatch, { msg: error, alertType: 'error' }));
    } else {
      setNewAlert(dispatch, { msg: 'Could not update profile', alertType: 'error' });
    }
    return null;
  }
};

export const followUser = async (dispatch: any, userId: string) => {
  try {
    const res = await axios.post('/api/users/' + userId + '/follow');
    setNewAlert(dispatch, { msg: res.data.msg || 'Followed successfully', alertType: 'success' });
    return true;
  } catch (err: any) {
    const errors = err.response?.data?.errors;
    if (errors) {
      errors.forEach((error: any) => setNewAlert(dispatch, { msg: error, alertType: 'error' }));
    } else {
      setNewAlert(dispatch, { msg: err.response?.data?.msg || 'Could not follow user', alertType: 'error' });
    }
    return false;
  }
};

export const unfollowUser = async (dispatch: any, userId: string) => {
  try {
    const res = await axios.post('/api/users/' + userId + '/unfollow');
    setNewAlert(dispatch, { msg: res.data.msg || 'Unfollowed successfully', alertType: 'success' });
    return true;
  } catch (err: any) {
    const errors = err.response?.data?.errors;
    if (errors) {
      errors.forEach((error: any) => setNewAlert(dispatch, { msg: error, alertType: 'error' }));
    } else {
      setNewAlert(dispatch, { msg: err.response?.data?.msg || 'Could not unfollow user', alertType: 'error' });
    }
    return false;
  }
};
