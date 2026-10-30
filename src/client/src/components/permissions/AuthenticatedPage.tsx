
import React, { useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import { RootState } from "../../store/store";
import { AuthenticatedPageProps } from "../../../types/components/AuthenticatedPage.types";
import { setNewAlert } from "../../service/alert";
import PageLoading from "../layout/PageLoading";

/**
 * AuthenticatedPage component
 * Renders children only if the user has at least one of the required roles.
 */

const AuthenticatedPage: React.FC<AuthenticatedPageProps> = ({ allowedRoles, children }) => {
  const { accountRoles, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  // Prevent duplicate alerts on redirect
  const redirectedRef = useRef(false);

  // Whether the user was signed in while this page was showing. Being signed out then (an expired
  // session, or signing out in another tab) comes with an alert saying why, so the redirect below
  // doesn't add "please log in" to it.
  const wasAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    if (isAuthenticated) wasAuthenticatedRef.current = true;
  }, [isAuthenticated]);

  const hasAccess =
    isAuthenticated &&
    Array.isArray(accountRoles) &&
    allowedRoles.some((role) => accountRoles.includes(role));

  useEffect(() => {
    if (redirectedRef.current) return;

    const timer = setTimeout(() => {
      // Prevent duplicate alerts if already on /login
      if (!isAuthenticated) {
        if (location.pathname !== "/login") {
          if (!wasAuthenticatedRef.current) {
            setNewAlert(dispatch, {
              msg: "Please log in to access this page.",
              alertType: "error"
            });
          }
          redirectedRef.current = true;
          navigate("/login", { replace: true });
        }
      } else if (!hasAccess) {
        setNewAlert(dispatch, {
          msg: "Sorry, you do not seem to have access to this page.",
          alertType: "error"
        });
        redirectedRef.current = true;
        navigate("/", { replace: true });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [hasAccess, isAuthenticated, dispatch, navigate, location]);

  // Showing until the redirect above happens, and while the page it goes to downloads
  if (!hasAccess) {
    return <PageLoading />;
  }

  return <React.Fragment>{children}</React.Fragment>;
};

export default AuthenticatedPage;
