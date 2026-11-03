<?php

class Livro
{
    protected $titulo;
    protected $autor;
    protected $disponivel;

    public function __construct($titulo, $autor){
        $this->titulo = $titulo;
        $this->autor = $autor;
        $this->disponivel = true;
    }

    public function setTitulo($titulo){
        $this->titulo = titulo;
    }
    public function getTitulo(){
        return $this->titulo;
    }


    public function setAutor($autor){
        $this->autor = $autor;
    }
    public function getAutor(){
        return $this->autor;
    }


    public function setDisponivel($disponivel){
        $this->disponivel = $disponivel;
    }
    public function getDisponivel(){
        return $this->disponivel;
    }

}

?>