import { isLoggedIn, getUserRole, getUserState, verifyAuthToken } from './auth.js';
import { showToast, showPopup, showSection } from './ui.js';

/**
 * Permission levels in order of increasing access
 * @type {Object}
 */
const PERMISSION_LEVELS = {
  PUBLIC: 0,      // Anyone can access
  USER: 1,        // Logged in users only
  APPROVED: 2,    // Approved users only
  MODERATOR: 3,   // Moderators and above
  ADMIN: 4        // Admins only
};

/**
 * Configuration for different pages/sections
 * @type {Object}
 */
const PAGE_CONFIG = {
  // Main site sections
  feedSection: { requiredPermission: PERMISSION_LEVELS.PUBLIC },
  profileSection: { requiredPermission: PERMISSION_LEVELS.USER },
  questionForm: { requiredPermission: PERMISSION_LEVELS.APPROVED },
  answerQuestionSection: { requiredPermission: PERMISSION_LEVELS.APPROVED },
    // Specific HTML pages
  '/admin.html': { requiredPermission: PERMISSION_LEVELS.ADMIN },
  '/reports.html': { requiredPermission: PERMISSION_LEVELS.MODERATOR },
  '/test-security.html': { requiredPermission: PERMISSION_LEVELS.MODERATOR }
};

/**
 * Get user's current permission level
 * @returns {number} - The user's permission level
 */
function getUserPermissionLevel() {
  if (!isLoggedIn()) {
    console.log('Permission: PUBLIC (not logged in)');
    return PERMISSION_LEVELS.PUBLIC;
  }
  
  const role = getUserRole();
  const state = getUserState();
  console.log(`User Role: ${role}, State: ${state}`);
  
  if (state === 'PENDING' && role !== 'ADMIN') {
    console.log('Permission: USER (pending state)');
    return PERMISSION_LEVELS.USER;
  }
  
  if (role === 'ADMIN') {
    console.log('Permission: ADMIN');
    return PERMISSION_LEVELS.ADMIN;
  } else if (role === 'MODERATOR' && state === 'APPROVED') {
    console.log('Permission: MODERATOR');
    return PERMISSION_LEVELS.MODERATOR;
  } else if (state === 'APPROVED') {
    console.log('Permission: APPROVED');
    return PERMISSION_LEVELS.APPROVED;
  } else {
    console.log('Permission: USER');
    return PERMISSION_LEVELS.USER;
  }
}

/**
 * Check if user has permission to access a section or page
 * @param {string} pageOrSectionId - Section ID or page path
 * @returns {boolean} - Whether the user has permission
 */
export function hasPermission(pageOrSectionId) {
  const userPermissionLevel = getUserPermissionLevel();
  
  // Default to PUBLIC if no specific configuration is found
  const config = PAGE_CONFIG[pageOrSectionId] || { requiredPermission: PERMISSION_LEVELS.PUBLIC };
  
  return userPermissionLevel >= config.requiredPermission;
}

/**
 * Navigate to a section with permission check
 * @param {string} sectionId - Section ID to navigate to
 * @param {Function} showSectionFn - Function to show the section if authorized
 * @returns {Promise<boolean>} - Promise resolving to whether navigation was successful
 */
export async function navigateToSection(sectionId, showSectionFn) {
  // For public sections, no checks needed
  if (sectionId === 'feedSection' || 
      (PAGE_CONFIG[sectionId] && PAGE_CONFIG[sectionId].requiredPermission === PERMISSION_LEVELS.PUBLIC)) {
    showSectionFn(sectionId);
    return true;
  }
  
  // For protected sections, verify token first if logged in
  if (isLoggedIn()) {
    try {
      const isValid = await verifyAuthToken();
      if (!isValid) {
        // Token is invalid - clear permissions and handle unauthorized access
        handleUnauthorizedAccess();
        return false;
      }
    } catch (error) {
      console.error('Error verifying auth token during navigation:', error);
      handleUnauthorizedAccess();
      return false;
    }
  }
  
  // Now check permissions
  if (hasPermission(sectionId)) {
    showSectionFn(sectionId);
    return true;
  } else {
    handleUnauthorizedAccess();
    return false;
  }
}

/**
 * Check page access when a protected page loads
 * @param {string} pagePath - Current page path (e.g., '/admin.html')
 */
export async function checkPageAccess(pagePath) {
  // First check if the token is valid
  if (isLoggedIn()) {
    try {
      const isValid = await verifyAuthToken();
      if (!isValid) {
        // Token is invalid, handle unauthorized access
        handleUnauthorizedAccess(true);
        return false;
      }
    } catch (error) {
      console.error('Error verifying auth token:', error);
      handleUnauthorizedAccess(true);
      return false;
    }
  }
  
  // Then check permissions
  if (!hasPermission(pagePath)) {
    handleUnauthorizedAccess(true);
    return false;
  }
  
  return true;
}

/**
 * Handle unauthorized access
 * @param {boolean} redirect - Whether to redirect to homepage
 */
function handleUnauthorizedAccess(redirect = false) {
  if (!isLoggedIn()) {
    showToast('error', 'Please log in to access this feature');
    if (typeof showPopup === 'function') {
      showPopup('login');
    }
  } else {
    const role = getUserRole();
    const state = getUserState();
    let message = 'Access denied: ';
    
    if (state !== 'APPROVED') {
      message += 'Your account is pending approval. Please wait for admin approval.';
      showToast('error', message);
    } else if (role === 'USER') {
      message += 'This page requires higher privileges (Moderator or Admin).';
      showToast('error', message);
    } else if (role === 'MODERATOR') {
      message += 'This page requires Admin privileges.';
      showToast('error', message);
    } else {
      message += 'Insufficient permissions.';
      showToast('error', message);
    }
  }
  
  if (redirect) {
    setTimeout(() => {
      window.location.href = '/?error=unauthorized';
    }, 1500);
  } else {
    if (typeof showSection === 'function') {
      showSection('feedSection');
    }
  }
}
