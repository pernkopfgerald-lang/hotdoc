<?php
/**
 * syBOS Api-CMS Demo
 * 
 * @version 22.04.2008
 * @copyright SOLARYS Informatik GmbH
 */

class SyList {
	private $perPage  = 10;
	private $actCount = 0;
	private $rowCount = 0;
	private $url 	  = "";

	public function __construct($url, $perPage) {
		$this->url = $url;
		$this->perPage = $perPage;
	}

	private function getPages() {
		$pages = ceil($this->rowCount / $this->perPage);
		return ($pages == 0) ? 1 : $pages;
	}

	public function getPrev() {
		$pages = $this->getPages();
		$prev  = $this->actCount-$this->perPage;

		if(($prev / $pages) < 0)
		return "Zur&uuml;ck";
		else
		return '<a href="'.$this->url.'&x='.$prev.'">Zur&uuml;ck</a>';
	}

	public function getNext() {
		$pages = $this->getPages();
		$next = $this->actCount+$this->perPage;

		if(($next/$pages) >= $this->perPage)
		return "Weiter";
		else
		return '<a href="'.$this->url.'&x='.$next.'">Weiter</a>';

	}

	public function getLimitStatement() {
		return "LIMIT ".$this->actCount.", ".$this->perPage;
	}

	public function getFrom() {
		return $this->actCount;
	}

	public function getPerPage() {
		return $this->perPage;
	}

	public function setActCount($count) {
		$pages = $this->getPages();
		$max = ($count/$pages);

		if(empty($count) || $count <= 0 || $max >= $this->perPage || ($count % $this->perPage))
		$this->actCount = 0;
		else
		$this->actCount = $count;
	}


	public function setRowCount($count) {
		$this->rowCount = $count;
	}

	public function getRowCount() {
		return $this->rowCount;
	}

	public function getCounter() {
		$html = "";

		if (($this->getFrom() + $this->getPerPage()) > $this->getRowCount())
		$p = $this->getRowCount();
		else
		$p = ($this->getFrom() + $this->getPerPage());

		$html .= "(".($this->getFrom() + 1)." - ".$p." von ".$this->getRowCount().") ";

		return $html;
	}

	public function getHtmlNavigation()  {
		return '
		<table class="listNavigation" cellspacing="0" cellpadding="0">
		 <tr><td class="listCounter">'.$this->getCounter().'&nbsp;</td><td class="listAction">'.$this->getPrev().' | '.$this->getNext().'</td></tr>
		</table>
		';	
	}
	public function getHtmlFooter()  {
		return "</table><small>Quelle: <a href='http://www.sybos.net'>syBOS</a></small>";	
	}	
}