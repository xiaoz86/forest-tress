import styles from "./xiaoya.module.css";

type XiaoyaSproutProps = {
  thinking?: boolean;
  className?: string;
};

/**
 * A deliberately non-human sprout: two young leaves, one stem and the seed
 * breaking through soil. It stays legible at the launcher's small size.
 */
export function XiaoyaSprout({ thinking = false, className = "" }: XiaoyaSproutProps) {
  return (
    <svg
      aria-hidden="true"
      className={`${thinking ? styles.sproutThinking : styles.sproutIdle} ${className}`}
      focusable="false"
      viewBox="0 0 64 64"
    >
      <path
        d="M13 49.5c5.2-5.1 11.7-7.5 19.1-7.5 7.2 0 13.6 2.4 18.9 7.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4.5"
      />
      <path
        d="M32 43V26.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        d="M31.5 29.5c-7.8.2-13-4.6-13.7-13.4 8.4-.8 14.1 4.2 13.7 13.4Z"
        fill="currentColor"
      />
      <path
        d="M33 25.4c1.2-8 6.6-12.1 15.5-11.5.2 8.6-5.1 13-15.5 11.5Z"
        fill="currentColor"
        opacity=".82"
      />
      <path
        d="M24 49.2c2.6 2.7 5.2 4 8 4 2.8 0 5.5-1.3 8-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.5"
        opacity=".55"
      />
    </svg>
  );
}
