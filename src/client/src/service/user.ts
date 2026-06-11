import axios from 'axios';
import { setNewAlert, setApiErrorAlert } from './alert';

export const getUserProfile = async (dispatch: any, userId: string) => {
  try {
    const res = await axios.get(`/api/users/${userId}/profile`);
    return res.data;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Could not fetch profile');
    return null;
  }
};

export const updateProfile = async (dispatch: any, data: { fullName?: string; bio?: string }) => {
  try {
    const res = await axios.put('/api/users/profile', data);
    setNewAlert(dispatch, { msg: 'Profile updated successfully', alertType: 'success' });
    return res.data;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Could not update profile');
    return null;
  }
};

export const followUser = async (dispatch: any, userId: string) => {
  try {
    const res = await axios.post(`/api/users/${userId}/follow`);
    setNewAlert(dispatch, { msg: res.data.msg || 'Followed successfully', alertType: 'success' });
    return true;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Could not follow user');
    return false;
  }
};

export const unfollowUser = async (dispatch: any, userId: string) => {
  try {
    const res = await axios.post(`/api/users/${userId}/unfollow`);
    setNewAlert(dispatch, { msg: res.data.msg || 'Unfollowed successfully', alertType: 'success' });
    return true;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Could not unfollow user');
    return false;
  }
};

export const searchUsers = async (dispatch: any, query: string, page: number = 0, pageSize: number = 10) => {
  try {
    const res = await axios.get('/api/users/search', {
      params: { query, page, pageSize }
    });
    return res.data;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Could not search users');
    return null;
  }
};

export const getUserFollowers = async (dispatch: any, userId: string) => {
  try {
    const res = await axios.get(`/api/users/${userId}/followers`);
    return res.data;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Could not fetch followers');
    return null;
  }
};

export const getUserFollowing = async (dispatch: any, userId: string) => {
  try {
    const res = await axios.get(`/api/users/${userId}/following`);
    return res.data;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Could not fetch following');
    return null;
  }
};
