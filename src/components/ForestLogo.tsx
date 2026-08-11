type Props = {
  /** 图标渲染尺寸。56px 以下自动使用为小尺寸重画的微标。 */
  size?: number;
  className?: string;
  /** 深色背景上的反白版本。 */
  onDark?: boolean;
};

const FULL_MARK_FROM = 56;

/**
 * 附近森林的矢量标记。
 *
 * 主标保留树、两个人、根系与开放圆环；导航和 favicon 使用同一视觉语言下
 * 单独重画的微标，避免把完整细节机械缩小后糊成一团。
 */
export default function ForestLogo({ size = 26, className, onDark = false }: Props) {
  const source =
    size >= FULL_MARK_FROM
      ? '/brand/nearby-forest-mark.svg'
      : '/brand/nearby-forest-icon.svg';

  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        flex: '0 0 auto',
        backgroundColor: onDark ? '#f5f1e8' : '#2f513d',
        WebkitMaskImage: `url(${source})`,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskImage: `url(${source})`,
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
        maskSize: 'contain',
      }}
    />
  );
}
