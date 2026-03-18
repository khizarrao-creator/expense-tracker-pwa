import React, { useState } from 'react';
import { Calculator as CalcIcon, Equal, Minus, Plus, X, Divide } from 'lucide-react';

const Calculator: React.FC = () => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState(false);

  const handleNum = (num: string) => {
    if (waitingForNewValue) {
      setDisplay(num);
      setWaitingForNewValue(false);
    } else {
      setDisplay(display === '0' ? num : display + num);
    }
  };

  const handleDot = () => {
    if (waitingForNewValue) {
      setDisplay('0.');
      setWaitingForNewValue(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleOp = (op: string) => {
    const currentVal = parseFloat(display);

    if (prevValue === null) {
      setPrevValue(currentVal);
      setEquation(`${currentVal} ${op}`);
    } else if (operator && !waitingForNewValue) {
      const result = calculate(prevValue, currentVal, operator);
      setDisplay(String(result));
      setPrevValue(result);
      setEquation(`${result} ${op}`);
    } else {
      setEquation(`${prevValue} ${op}`);
    }

    setOperator(op);
    setWaitingForNewValue(true);
  };

  const calculate = (a: number, b: number, op: string) => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? 0 : a / b;
      default: return b;
    }
  };

  const handleEqual = () => {
    if (operator && prevValue !== null) {
      const currentVal = parseFloat(display);
      const result = calculate(prevValue, currentVal, operator);
      setDisplay(String(result));
      setEquation(`${prevValue} ${operator} ${currentVal} =`);
      setPrevValue(null);
      setOperator(null);
      setWaitingForNewValue(true);
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
    setPrevValue(null);
    setOperator(null);
    setWaitingForNewValue(false);
  };



  const handleToggleSign = () => {
    setDisplay(String(parseFloat(display) * -1));
  };

  const handlePercentage = () => {
    setDisplay(String(parseFloat(display) / 100));
  };

  const Button = ({ children, onClick, variant = 'default', className = '' }: any) => {
    const baseStyle = "h-16 rounded-2xl text-xl font-medium transition-all active:scale-95 flex items-center justify-center";
    const variants = {
      default: "bg-muted text-foreground hover:bg-muted/80",
      primary: "bg-primary text-primary-foreground hover:bg-primary/90",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      accent: "bg-accent text-accent-foreground hover:bg-accent/80 font-bold"
    };

    return (
      <button 
        onClick={onClick} 
        className={`${baseStyle} ${variants[variant as keyof typeof variants]} ${className}`}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="max-w-md mx-auto h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <div className="bg-primary/10 text-primary p-1.5 rounded-lg">
            <CalcIcon size={20} />
          </div>
          Calculator
        </h1>
      </div>

      <div className="bg-card border border-border rounded-3xl p-6 flex-1 flex flex-col justify-end shadow-sm">
        <div className="flex flex-col items-end justify-end mb-6 min-h-[120px] break-all">
          <div className="text-muted-foreground text-sm font-medium h-6 mb-2">
            {equation}
          </div>
          <div className="text-5xl font-bold text-foreground tracking-tight">
            {display}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {/* Row 1 */}
          <Button onClick={handleClear} variant="secondary">AC</Button>
          <Button onClick={handleToggleSign} variant="secondary">+/-</Button>
          <Button onClick={handlePercentage} variant="secondary">%</Button>
          <Button onClick={() => handleOp('÷')} variant={operator === '÷' ? 'primary' : 'accent'}><Divide size={24} /></Button>

          {/* Row 2 */}
          <Button onClick={() => handleNum('7')}>7</Button>
          <Button onClick={() => handleNum('8')}>8</Button>
          <Button onClick={() => handleNum('9')}>9</Button>
          <Button onClick={() => handleOp('×')} variant={operator === '×' ? 'primary' : 'accent'}><X size={24} /></Button>

          {/* Row 3 */}
          <Button onClick={() => handleNum('4')}>4</Button>
          <Button onClick={() => handleNum('5')}>5</Button>
          <Button onClick={() => handleNum('6')}>6</Button>
          <Button onClick={() => handleOp('-')} variant={operator === '-' ? 'primary' : 'accent'}><Minus size={24} /></Button>

          {/* Row 4 */}
          <Button onClick={() => handleNum('1')}>1</Button>
          <Button onClick={() => handleNum('2')}>2</Button>
          <Button onClick={() => handleNum('3')}>3</Button>
          <Button onClick={() => handleOp('+')} variant={operator === '+' ? 'primary' : 'accent'}><Plus size={24} /></Button>

          {/* Row 5 */}
          <Button onClick={() => handleNum('0')} className="col-span-2">0</Button>
          <Button onClick={handleDot}>.</Button>
          <Button onClick={handleEqual} variant="primary"><Equal size={24} /></Button>
        </div>
      </div>
    </div>
  );
};

export default Calculator;
