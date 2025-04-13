import React, { useEffect, useState, useRef, ReactNode } from 'react';
export type AnimationDirection = 'top' | 'right' | 'bottom' | 'left' | 'none';
interface AnimatedComponentProps {
  children: ReactNode;
  direction?: AnimationDirection;
  distance?: number;
  duration?: number;
  delay?: number;
  once?: boolean;
  threshold?: number; //0 to 1, similar to IntersectionObserver threshold
  className?: string;
  style?: React.CSSProperties;
  animateOnMount?: boolean;
  initialOpacity?: number;
  finalOpacity?: number;
}
const AnimatedComponent: React.FC<AnimatedComponentProps> = ({
  children,
  direction = 'none',
  distance = 50,
  duration = 0.8,
  delay = 0,
  once = true,
  threshold = 0.1,
  className = '',
  style = {},
  animateOnMount = true,
  initialOpacity = 0,
  finalOpacity = 1,
}) => {
  const [isVisible, setIsVisible] = useState(!animateOnMount);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || (once && hasAnimated)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) {
            setHasAnimated(true);
            observer.disconnect();
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold }
    );
    observer.observe(ref.current);
    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [once, threshold, hasAnimated]);
  const getInitialTransform = () => {
    switch (direction) {
      case 'top':
        return `translateY(-${distance}px)`;
      case 'right':
        return `translateX(${distance}px)`;
      case 'bottom':
        return `translateY(${distance}px)`;
      case 'left':
        return `translateX(-${distance}px)`;
      default:
        return 'none';
    }
  };
  const animationStyle = {
    opacity: isVisible ? finalOpacity : initialOpacity,
    transform: isVisible ? 'translate(0, 0)' : getInitialTransform(),
    transition: `opacity ${duration}s ease, transform ${duration}s ease`,
    transitionDelay: `${delay}s`,
    ...style,
  };
  return (
    <div
      ref={ref}
      className={className}
      style={animationStyle}
    >
      {children}
    </div>
  );
};
export default AnimatedComponent;