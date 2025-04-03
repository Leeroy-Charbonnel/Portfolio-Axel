import React from 'react';

interface GreetingProps {
  name: string;
}

// Simple component using function declaration
function Greeting({ name }: GreetingProps) {
  return <h1>Hello, {name}!</h1>;
}

export default Greeting;