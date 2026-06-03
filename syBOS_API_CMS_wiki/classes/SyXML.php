<?php
/**
 * syBOS Api-CMS Demo
 * 
 * @version 22.04.2008
 * @copyright SOLARYS Informatik GmbH
 */

class SyXML {
	private $file = "";
	private $xml  = "";

	public function __construct($file) {
		$this->file = $file;
	}

	public function readXML() {
		$contents = $this->readRessource();
		try {
			$this->xml = new SimpleXMLElement($contents);
		} catch(Exception $e) {
			return false;
		}

		return true;
	}

	private function readRessource() {
		$contents = "";

		$handle = fopen($this->file, "rb");
		$contents = stream_get_contents($handle);
		fclose($handle);

		return $contents;
	}

	public function fetchNodes($node) {
		$xml = $this->xml;
		$itemsArr = array();

		foreach($xml->$node AS $items) {
			$itemsArr[] =$items;
		}

		return $itemsArr;
	}

	public function fetchSingleNode($node) {
		$xml =  $this->xml;
		return $xml->$node;
	}
}