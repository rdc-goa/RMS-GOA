import { adminDb } from './admin';

interface RateLimitConfig {
  points: number;       // Max attempts
  duration: number;     // Time window in seconds
  blockDuration?: number; // How long to block if limit reached (seconds)
}

/**
 * A robust Firestore-backed rate limiter for server actions.
 * Protects sensitive endpoints (OTP, Search) without requiring Redis.
 */
export async function checkRateLimit(
  key: string, 
  config: RateLimitConfig = { points: 5, duration: 300, blockDuration: 600 }
) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const rateLimitRef = adminDb.collection('rateLimits').doc(key);
    
    const doc = await rateLimitRef.get();
    const data = doc.data();

    if (doc.exists && data) {
      const { pointsUsed, windowStart, blockedUntil } = data;

      // Check if currently blocked
      if (blockedUntil && now < blockedUntil) {
        return { 
          success: false, 
          remaining: 0, 
          resetTime: blockedUntil 
        };
      }

      // Check if window has expired
      if (now > windowStart + config.duration) {
        // Reset window
        await rateLimitRef.set({
          pointsUsed: 1,
          windowStart: now,
          blockedUntil: 0
        });
        return { success: true, remaining: config.points - 1, resetTime: now + config.duration };
      }

      // Increment points used
      const newPointsUsed = pointsUsed + 1;
      
      if (newPointsUsed > config.points) {
        // Block the user
        const blockUntil = now + (config.blockDuration || config.duration);
        await rateLimitRef.update({
          pointsUsed: newPointsUsed,
          blockedUntil: blockUntil
        });
        return { 
          success: false, 
          remaining: 0, 
          resetTime: blockUntil 
        };
      }

      await rateLimitRef.update({ pointsUsed: newPointsUsed });
      return { 
        success: true, 
        remaining: config.points - newPointsUsed, 
        resetTime: windowStart + config.duration 
      };
    } else {
      // First attempt
      await rateLimitRef.set({
        pointsUsed: 1,
        windowStart: now,
        blockedUntil: 0
      });
      return { success: true, remaining: config.points - 1, resetTime: now + config.duration };
    }
  } catch (error) {
    console.error('Rate limit error:', error);
    // Fail open to avoid blocking users on DB failure, but log it
    return { success: true, remaining: 1, resetTime: 0 };
  }
}
