// Command notes es el punto de entrada del CLI de notas. Toda la lógica vive en
// el paquete src (reutilizable y testeable); aquí solo se conectan os.Args y los
// flujos estándar y se propaga el código de salida.
package main

import (
	"os"

	"notes/src"
)

func main() {
	os.Exit(src.Run(os.Args[1:], os.Stdout, os.Stderr))
}
