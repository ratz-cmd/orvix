import React from 'react';

interface CarouselTitleProps {
  icon?: string;
  iconClass?: string;
  label: string;
}

const CarouselTitle: React.FC<CarouselTitleProps> = ({ icon, iconClass, label }) => (
  <span>
    {icon && <span className={`mr-2 ${iconClass ?? ''}`}>{icon}</span>}
    <span>{label}</span>
  </span>
);

export default React.memo(CarouselTitle);
