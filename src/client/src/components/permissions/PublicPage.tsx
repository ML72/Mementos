import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { RootState } from "../../store/store";
import PageLoading from "../layout/PageLoading";

interface PublicPageProps {
  children: React.ReactNode;
  restrictAuthenticated?: boolean;
}

/**
 * PublicPage component
 * Renders children only if the user has no roles (not authenticated).
 * If the user has any roles and restrictAuthenticated is true, redirects to /home.
 */
const PublicPage: React.FC<PublicPageProps> = ({ children, restrictAuthenticated = true }) => {
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();

  useEffect(() => {
    if (restrictAuthenticated && isAuthenticated) {
      navigate("/home", { replace: true });
    }
  }, [isAuthenticated, navigate, restrictAuthenticated]);

  // Showing while the redirect waits for the signed-in page to download
  if (restrictAuthenticated && isAuthenticated) {
    return <PageLoading />;
  }


  return <React.Fragment>{children}</React.Fragment>;
};

export default PublicPage;
