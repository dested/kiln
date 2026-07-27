import { useEffect } from 'react';
import SimWell from '../components/SimWell.jsx';

/** The console alone, no site chrome — for a second monitor or a long stare. */
export default function Play() {
  useEffect(() => {
    document.title = 'KILN — console';
    return () => {
      document.title = 'KILN — an infinite crafting ecology that runs forever';
    };
  }, []);

  return <SimWell bare />;
}
