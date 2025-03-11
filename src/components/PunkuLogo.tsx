import React from 'react';
import { ReactComponent as Logo } from '../assets/PunkuLogo.svg';

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
}

const PunkuLogo: React.FC<LogoProps> = ({ 
  width = 32, 
  height = 32, 
  className = "" 
}) => {
  return <Logo className={className} width={width} height={height} />;
};

export default PunkuLogo; 