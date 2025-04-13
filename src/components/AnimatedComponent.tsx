import React, { useRef, ReactNode, RefObject } from 'react';
import { useIsInView } from "@/utils/Utils";

export type AnimationDirection = 'top' | 'right' | 'bottom' | 'left' | 'none';

interface AnimatedComponentProps {
  children: ReactNode;
  direction?: AnimationDirection;
  distance?: number;
  duration?: number;
  delay?: number;
  once?: boolean;
  threshold?: number;
  className?: string;
  style?: React.CSSProperties;
  animateOnMount?: boolean;
  initialOpacity?: number;
  finalOpacity?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
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
  onMouseEnter,
  onMouseLeave
}) => {
  const ref = useRef<HTMLDivElement>(null);

  const isInView = useIsInView((ref as RefObject<HTMLDivElement>), {
    threshold,
    rootMargin: '0px 0px 100px 0px', //Start animation when element is 100px below viewport
    once
  });

  // Determine if we should show the element
  const isVisible = animateOnMount ? isInView : true;

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
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
};

export default AnimatedComponent;